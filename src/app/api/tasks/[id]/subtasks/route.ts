import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { id } = params;

    const subtasks = await prisma.subtask.findMany({
      where: { taskId: id },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ subtasks });
  } catch (error) {
    console.error("Get subtasks error:", error);
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
    const { title } = await request.json();

    if (!title) {
      return NextResponse.json(
        { error: "عنوان المهمة الفرعية مطلوب" },
        { status: 400 }
      );
    }

    const task = await prisma.task.findUnique({ where: { id } });

    if (!task) {
      return NextResponse.json({ error: "المهمة غير موجودة" }, { status: 404 });
    }

    const maxOrder = await prisma.subtask.aggregate({
      where: { taskId: id },
      _max: { order: true },
    });

    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const subtask = await prisma.subtask.create({
      data: {
        title,
        taskId: id,
        order: nextOrder,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: userOrResponse.userId,
        action: "CREATE",
        entityType: "Subtask",
        entityId: subtask.id,
        details: `إضافة مهمة فرعية "${title}" للمهمة "${task.title}"`,
      },
    });

    return NextResponse.json({ subtask }, { status: 201 });
  } catch (error) {
    console.error("Create subtask error:", error);
    return NextResponse.json(
      { error: "حدث خطأ في إنشاء المهمة الفرعية" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { id } = params;
    const { id: subtaskId, completed, title, order } = await request.json();

    if (!subtaskId) {
      return NextResponse.json(
        { error: "معرف المهمة الفرعية مطلوب" },
        { status: 400 }
      );
    }

    const existing = await prisma.subtask.findUnique({
      where: { id: subtaskId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "المهمة الفرعية غير موجودة" },
        { status: 404 }
      );
    }

    if (existing.taskId !== id) {
      return NextResponse.json(
        { error: "المهمة الفرعية لا تنتمي لهذه المهمة" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (completed !== undefined) updateData.completed = completed;
    if (title !== undefined) updateData.title = title;
    if (order !== undefined) updateData.order = order;

    const updated = await prisma.subtask.update({
      where: { id: subtaskId },
      data: updateData,
    });

    if (completed !== undefined && completed !== existing.completed) {
      await prisma.activityLog.create({
        data: {
          userId: userOrResponse.userId,
          action: completed ? "COMPLETE" : "UNCOMPLETE",
          entityType: "Subtask",
          entityId: subtaskId,
          details: completed
            ? `إكمال المهمة الفرعية "${existing.title}"`
            : `إلغاء إكمال المهمة الفرعية "${existing.title}"`,
        },
      });
    }

    if (title !== undefined && title !== existing.title) {
      await prisma.activityLog.create({
        data: {
          userId: userOrResponse.userId,
          action: "UPDATE",
          entityType: "Subtask",
          entityId: subtaskId,
          details: `تعديل عنوان المهمة الفرعية من "${existing.title}" إلى "${title}"`,
        },
      });
    }

    return NextResponse.json({ subtask: updated });
  } catch (error) {
    console.error("Update subtask error:", error);
    return NextResponse.json(
      { error: "حدث خطأ في تحديث المهمة الفرعية" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { id } = params;
    const { id: subtaskId } = await request.json();

    if (!subtaskId) {
      return NextResponse.json(
        { error: "معرف المهمة الفرعية مطلوب" },
        { status: 400 }
      );
    }

    const existing = await prisma.subtask.findUnique({
      where: { id: subtaskId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "المهمة الفرعية غير موجودة" },
        { status: 404 }
      );
    }

    if (existing.taskId !== id) {
      return NextResponse.json(
        { error: "المهمة الفرعية لا تنتمي لهذه المهمة" },
        { status: 400 }
      );
    }

    await prisma.subtask.delete({ where: { id: subtaskId } });

    const task = await prisma.task.findUnique({ where: { id } });

    await prisma.activityLog.create({
      data: {
        userId: userOrResponse.userId,
        action: "DELETE",
        entityType: "Subtask",
        entityId: subtaskId,
        details: `حذف المهمة الفرعية "${existing.title}" من المهمة "${task?.title}"`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete subtask error:", error);
    return NextResponse.json(
      { error: "حدث خطأ في حذف المهمة الفرعية" },
      { status: 500 }
    );
  }
}
