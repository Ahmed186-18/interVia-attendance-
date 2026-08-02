import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const project = await prisma.project.findFirst({
      where: { id, deletedAt: null },
    });

    if (!project) {
      return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });
    }

    const totalTasks = await prisma.task.count({
      where: { projectId: id },
    });

    const completedTasks = await prisma.task.count({
      where: { projectId: id, status: "COMPLETED" },
    });

    const inProgressTasks = await prisma.task.count({
      where: { projectId: id, status: "IN_PROGRESS" },
    });

    const inReviewTasks = await prisma.task.count({
      where: { projectId: id, status: "IN_REVIEW" },
    });

    const tasksByPriority = await prisma.task.groupBy({
      by: ["priority"],
      where: { projectId: id },
      _count: true,
    });

    const priorityCounts: Record<string, number> = {
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };
    tasksByPriority.forEach((item) => {
      priorityCounts[item.priority] = item._count;
    });

    const membersCount = await prisma.projectMember.count({
      where: { projectId: id },
    });

    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const taskIds = (
      await prisma.task.findMany({
        where: { projectId: id },
        select: { id: true },
      })
    ).map((t) => t.id);

    const recentActivity = await prisma.activityLog.findMany({
      where: {
        OR: [
          { entityType: "project", entityId: id },
          { entityType: "task", entityId: { in: taskIds } },
        ],
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      stats: {
        totalTasks,
        completedTasks,
        inProgressTasks,
        inReviewTasks,
        byPriority: priorityCounts,
        membersCount,
        progress,
        recentActivity,
      },
    });
  } catch (error) {
    console.error("Get project stats error:", error);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}
