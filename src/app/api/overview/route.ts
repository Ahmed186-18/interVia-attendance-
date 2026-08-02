import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const userOrResponse = requireManager(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const [
      totalActiveEmployees,
      tasksInReview,
      pendingOvertime,
      activeProjects,
      todayAttendance,
      recentActivity,
    ] = await Promise.all([
      prisma.user.count({
        where: { isActive: true, role: "EMPLOYEE" },
      }),
      prisma.task.count({
        where: { status: "IN_REVIEW" },
      }),
      prisma.overtimeRequest.count({
        where: { status: "PENDING" },
      }),
      prisma.project.count({
        where: {
          deletedAt: null,
          tasks: {
            some: { status: { not: "COMPLETED" } },
          },
        },
      }),
      prisma.attendance.count({
        where: {
          date: {
            gte: todayStart,
            lt: todayEnd,
          },
        },
      }),
      prisma.activityLog.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { user: true },
      }),
    ]);

    return NextResponse.json({
      stats: {
        totalActiveEmployees,
        tasksInReview,
        pendingOvertime,
        activeProjects,
        todayAttendance,
        recentActivity,
      },
    });
  } catch (error) {
    console.error("Overview stats error:", error);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}
