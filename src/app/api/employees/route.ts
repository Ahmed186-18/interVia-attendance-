import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/auth";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export async function GET(request: NextRequest) {
  const userOrResponse = requireManager(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        country: true,
        timezone: true,
        isActive: true,
        createdAt: true,
        attendanceRecords: {
          where: { date: { gte: monthStart, lt: tomorrow } },
          include: {
            hourlyChecks: { select: { isConfirmed: true, isDeducted: true } },
          },
          orderBy: { date: "desc" },
        },
        assignedTasks: {
          where: { project: { deletedAt: null } },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            deadline: true,
            updatedAt: true,
            project: { select: { id: true, name: true } },
            timeEntries: {
              where: { startedAt: { gte: monthStart, lt: tomorrow } },
              select: { duration: true },
            },
          },
          orderBy: { updatedAt: "desc" },
        },
        projects: {
          where: { project: { deletedAt: null } },
          select: {
            id: true,
            createdAt: true,
            project: {
              select: {
                id: true,
                name: true,
                deadline: true,
                _count: { select: { tasks: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        leaveRequests: {
          orderBy: { createdAt: "desc" },
          take: 8,
        },
        overtimeRequests: {
          orderBy: { createdAt: "desc" },
          take: 8,
        },
        activityLogs: {
          orderBy: { createdAt: "desc" },
          take: 8,
          select: {
            id: true,
            action: true,
            entityType: true,
            details: true,
            createdAt: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const employees = users.map((user) => {
      const todayAttendance = user.attendanceRecords.find(
        (record) => record.date >= today && record.date < tomorrow
      );
      const activeLeave = user.leaveRequests.find(
        (leave) =>
          leave.status === "APPROVED" &&
          leave.startDate < tomorrow &&
          leave.endDate >= today
      );
      const activeTasks = user.assignedTasks.filter((task) => task.status !== "COMPLETED");
      const overdueTasks = activeTasks.filter((task) => task.deadline && task.deadline < now).length;
      const highPriorityTasks = activeTasks.filter((task) => task.priority === "HIGH").length;
      const completedTasks = user.assignedTasks.filter((task) => task.status === "COMPLETED").length;
      const workloadScore = activeTasks.length + highPriorityTasks * 2 + overdueTasks * 2;
      const workload =
        workloadScore >= 10 ? "HIGH" : workloadScore >= 4 ? "BALANCED" : "LOW";
      const monthHours = user.attendanceRecords.reduce((sum, record) => sum + record.totalHours, 0);
      const trackedHours = user.assignedTasks.reduce(
        (sum, task) =>
          sum + task.timeEntries.reduce((entrySum, entry) => entrySum + (entry.duration || 0), 0),
        0
      );
      const status = user.role === "ADMIN"
        ? "NOT_REQUIRED"
        : !user.isActive
        ? "INACTIVE"
        : activeLeave
          ? "ON_LEAVE"
          : todayAttendance?.isActive && !todayAttendance.checkOut
            ? "WORKING"
            : todayAttendance?.checkOut
              ? "CHECKED_OUT"
              : "ABSENT";

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        country: user.country,
        timezone: user.timezone,
        isActive: user.isActive,
        createdAt: user.createdAt,
        status,
        workload,
        metrics: {
          activeTasks: activeTasks.length,
          overdueTasks,
          highPriorityTasks,
          completedTasks,
          projects: user.projects.length,
          monthHours,
          trackedHours,
          pendingRequests:
            user.leaveRequests.filter((request) => request.status === "PENDING").length +
            user.overtimeRequests.filter((request) => request.status === "PENDING").length,
        },
        todayAttendance: todayAttendance
          ? {
              id: todayAttendance.id,
              checkIn: todayAttendance.checkIn,
              checkOut: todayAttendance.checkOut,
              totalHours: todayAttendance.totalHours,
              confirmedChecks: todayAttendance.hourlyChecks.filter((check) => check.isConfirmed).length,
              deductedChecks: todayAttendance.hourlyChecks.filter((check) => check.isDeducted).length,
              totalChecks: todayAttendance.hourlyChecks.length,
            }
          : null,
        attendance: user.attendanceRecords.map((record) => ({
          id: record.id,
          date: record.date,
          checkIn: record.checkIn,
          checkOut: record.checkOut,
          totalHours: record.totalHours,
          confirmedChecks: record.hourlyChecks.filter((check) => check.isConfirmed).length,
          deductedChecks: record.hourlyChecks.filter((check) => check.isDeducted).length,
          totalChecks: record.hourlyChecks.length,
        })),
        tasks: user.assignedTasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          deadline: task.deadline,
          updatedAt: task.updatedAt,
          project: task.project,
          trackedHours: task.timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0),
        })),
        projects: user.projects.map((membership) => ({
          membershipId: membership.id,
          joinedAt: membership.createdAt,
          ...membership.project,
        })),
        leaveRequests: user.leaveRequests,
        overtimeRequests: user.overtimeRequests,
        activity: user.activityLogs,
      };
    });

    return NextResponse.json({
      summary: {
        total: employees.filter((employee) => employee.isActive).length,
        inactive: employees.filter((employee) => !employee.isActive).length,
        working: employees.filter((employee) => employee.status === "WORKING").length,
        onLeave: employees.filter((employee) => employee.status === "ON_LEAVE").length,
        absent: employees.filter((employee) => employee.role !== "ADMIN" && employee.status === "ABSENT").length,
        overloaded: employees.filter((employee) => employee.isActive && employee.workload === "HIGH").length,
        pendingRequests: employees.reduce(
          (sum, employee) => sum + employee.metrics.pendingRequests,
          0
        ),
      },
      employees,
    });
  } catch (error) {
    console.error("Employees dashboard error:", error);
    return NextResponse.json({ error: "تعذر تحميل بيانات الموظفين" }, { status: 500 });
  }
}
