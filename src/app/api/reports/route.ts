import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/auth";

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + 1);
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  const userOrResponse = requireManager(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const parsedFrom = searchParams.get("from") ? new Date(`${searchParams.get("from")}T00:00:00`) : defaultFrom;
    const parsedTo = searchParams.get("to") ? new Date(`${searchParams.get("to")}T00:00:00`) : now;
    const from = startOfDay(Number.isNaN(parsedFrom.getTime()) ? defaultFrom : parsedFrom);
    const to = endOfDay(Number.isNaN(parsedTo.getTime()) ? now : parsedTo);
    const userId = searchParams.get("userId") || undefined;
    const projectId = searchParams.get("projectId") || undefined;

    const attendanceWhere = {
      date: { gte: from, lt: to },
      ...(userId ? { userId } : {}),
    };
    const taskWhere = {
      updatedAt: { gte: from, lt: to },
      project: { deletedAt: null },
      ...(userId ? { assigneeId: userId } : {}),
      ...(projectId ? { projectId } : {}),
    };

    const [users, projects, attendance, tasks, overtime] = await Promise.all([
      prisma.user.findMany({
        where: { isActive: true, role: "EMPLOYEE" },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      }),
      prisma.project.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, code: true, deadline: true },
        orderBy: { name: "asc" },
      }),
      prisma.attendance.findMany({
        where: attendanceWhere,
        include: {
          user: { select: { id: true, name: true, email: true } },
          hourlyChecks: { select: { isConfirmed: true, isDeducted: true } },
        },
        orderBy: [{ date: "desc" }, { checkIn: "desc" }],
      }),
      prisma.task.findMany({
        where: taskWhere,
        include: {
          assignee: { select: { id: true, name: true } },
          project: { select: { id: true, name: true, code: true, deadline: true } },
          subtasks: { select: { completed: true } },
          timeEntries: {
            where: { startedAt: { gte: from, lt: to } },
            select: { duration: true },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.overtimeRequest.findMany({
        where: {
          createdAt: { gte: from, lt: to },
          ...(userId ? { userId } : {}),
        },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const totalHours = attendance.reduce((sum, item) => sum + item.totalHours, 0);
    const allChecks = attendance.flatMap((item) => item.hourlyChecks);
    const confirmedChecks = allChecks.filter((item) => item.isConfirmed).length;
    const deductedChecks = allChecks.filter((item) => item.isDeducted).length;
    const completedTasks = tasks.filter((item) => item.status === "COMPLETED").length;
    const overdueTasks = tasks.filter(
      (item) => item.status !== "COMPLETED" && item.deadline && item.deadline < now
    ).length;
    const approvedOvertimeHours = overtime
      .filter((item) => item.status === "APPROVED")
      .reduce((sum, item) => sum + item.hours, 0);

    const trendMap = new Map<string, { date: string; attendance: number; hours: number; completed: number }>();
    for (const item of attendance) {
      const key = dateKey(item.date);
      const current = trendMap.get(key) || { date: key, attendance: 0, hours: 0, completed: 0 };
      current.attendance += 1;
      current.hours += item.totalHours;
      trendMap.set(key, current);
    }
    for (const item of tasks) {
      if (item.status !== "COMPLETED" || item.updatedAt < from || item.updatedAt >= to) continue;
      const key = dateKey(item.updatedAt);
      const current = trendMap.get(key) || { date: key, attendance: 0, hours: 0, completed: 0 };
      current.completed += 1;
      trendMap.set(key, current);
    }

    const projectStats = projects
      .map((project) => {
        const projectTasks = tasks.filter((task) => task.project.id === project.id);
        const completed = projectTasks.filter((task) => task.status === "COMPLETED").length;
        const overdue = projectTasks.filter(
          (task) => task.status !== "COMPLETED" && task.deadline && task.deadline < now
        ).length;
        const trackedHours = projectTasks.reduce(
          (sum, task) => sum + task.timeEntries.reduce((entrySum, entry) => entrySum + (entry.duration || 0), 0),
          0
        );
        return {
          id: project.id,
          name: project.name,
          code: project.code,
          deadline: project.deadline,
          totalTasks: projectTasks.length,
          completedTasks: completed,
          overdueTasks: overdue,
          trackedHours,
          progress: projectTasks.length ? Math.round((completed / projectTasks.length) * 100) : 0,
        };
      })
      .filter((project) => !projectId || project.id === projectId);

    return NextResponse.json({
      range: { from, to },
      filters: { users, projects },
      summary: {
        attendanceDays: attendance.length,
        totalHours,
        averageHours: attendance.length ? totalHours / attendance.length : 0,
        confirmedRate: allChecks.length ? Math.round((confirmedChecks / allChecks.length) * 100) : 0,
        deductedChecks,
        completedTasks,
        completionRate: tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0,
        overdueTasks,
        pendingOvertime: overtime.filter((item) => item.status === "PENDING").length,
        approvedOvertimeHours,
      },
      charts: {
        trend: Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
        taskStatus: {
          IN_PROGRESS: tasks.filter((item) => item.status === "IN_PROGRESS").length,
          IN_REVIEW: tasks.filter((item) => item.status === "IN_REVIEW").length,
          COMPLETED: completedTasks,
        },
      },
      attendance: attendance.map((item) => ({
        id: item.id,
        date: item.date,
        checkIn: item.checkIn,
        checkOut: item.checkOut,
        totalHours: item.totalHours,
        isActive: item.isActive,
        status: item.status,
        lateMinutes: item.lateMinutes,
        earlyLeaveMinutes: item.earlyLeaveMinutes,
        user: item.user,
        confirmedChecks: item.hourlyChecks.filter((check) => check.isConfirmed).length,
        deductedChecks: item.hourlyChecks.filter((check) => check.isDeducted).length,
        totalChecks: item.hourlyChecks.length,
      })),
      tasks: tasks.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        priority: item.priority,
        deadline: item.deadline,
        updatedAt: item.updatedAt,
        assignee: item.assignee,
        project: item.project,
        subtaskProgress: item.subtasks.length
          ? Math.round((item.subtasks.filter((subtask) => subtask.completed).length / item.subtasks.length) * 100)
          : 0,
        trackedHours: item.timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0),
      })),
      projects: projectStats,
      overtime: overtime.map((item) => ({
        id: item.id,
        hours: item.hours,
        status: item.status,
        reason: item.reason,
        createdAt: item.createdAt,
        user: item.user,
      })),
    });
  } catch (error) {
    console.error("Reports error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء إعداد التقرير" }, { status: 500 });
  }
}
