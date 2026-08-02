import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { createNotification } from "@/lib/utils";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { id } = params;

    const task = await prisma.task.findUnique({ where: { id } });

    if (!task) {
      return NextResponse.json({ error: "المهمة غير موجودة" }, { status: 404 });
    }

    const comments = await prisma.comment.findMany({
      where: { taskId: id },
      include: {
        author: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ comments });
  } catch (error) {
    console.error("Get comments error:", error);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { id } = params;
    const { content } = await request.json();

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: "محتوى التعليق مطلوب" },
        { status: 400 }
      );
    }

    const task = await prisma.task.findUnique({ where: { id } });

    if (!task) {
      return NextResponse.json({ error: "المهمة غير موجودة" }, { status: 404 });
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        taskId: id,
        authorId: userOrResponse.userId,
      },
      include: {
        author: { select: { id: true, name: true } },
      },
    });

    const author = await prisma.user.findUnique({
      where: { id: userOrResponse.userId },
      select: { name: true },
    });

    await prisma.activityLog.create({
      data: {
        userId: userOrResponse.userId,
        action: "CREATE",
        entityType: "Comment",
        entityId: comment.id,
        details: `${author?.name} أضاف تعليقاً على المهمة "${task.title}"`,
      },
    });

    const recipients = Array.from(new Set([task.assigneeId, task.creatorId])).filter(
      (userId) => userId !== userOrResponse.userId
    );
    await Promise.all(
      recipients.map((userId) =>
        createNotification({
          userId,
          type: "TASK_COMMENT",
          audience: "USER",
          title: "تعليق جديد على مهمة",
          message: `${author?.name || "أحد أعضاء الفريق"} علّق على "${task.title}"`,
          severity: "INFO",
          entityType: "Task",
          entityId: task.id,
          actionUrl: `/tasks?task=${task.id}`,
        })
      )
    );

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error("Create comment error:", error);
    return NextResponse.json({ error: "حدث خطأ في إنشاء التعليق" }, { status: 500 });
  }
}
