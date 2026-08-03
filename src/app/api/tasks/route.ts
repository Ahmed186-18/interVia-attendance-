import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { createAuditLog, createNotification, notifyAdmins } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const assigneeId = searchParams.get("assigneeId");
    const search = searchParams.get("search");
    const view = searchParams.get("view");
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const where: Record<string, unknown> = {
      project: { deletedAt: null },
    };

    if (projectId) where.projectId = projectId;
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assigneeId) where.assigneeId = assigneeId;

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    if (userOrResponse.role === "EMPLOYEE") {
      where.assigneeId = userOrResponse.userId;
    } else if (view === "my") {
      where.OR = [
        { assigneeId: userOrResponse.userId },
        { creatorId: userOrResponse.userId },
      ];
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        _count: { select: { comments: true, subtasks: true, timeEntries: true } },
        timeEntries: {
          where: {
            userId: userOrResponse.userId,
            OR: [{ endedAt: null }, { startedAt: { gte: todayStart } }],
          },
          select: {
            id: true,
            startedAt: true,
            endedAt: true,
            duration: true,
          },
          orderBy: { startedAt: "desc" },
        },
      },
      orderBy: [
        { executionOrder: "asc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json(
      { tasks },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  } catch (error) {
    console.error("Get tasks error:", error);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { title, description, projectId, assigneeId: requestedAssigneeId, deadline, priority } =
      await request.json();
    const assigneeId = userOrResponse.role === "EMPLOYEE"
      ? userOrResponse.userId
      : requestedAssigneeId;

    if (!title || !projectId || !assigneeId) {
      return NextResponse.json(
        { error: userOrResponse.role === "EMPLOYEE" ? "العنوان والمشروع مطلوبان" : "العنوان والمشروع والموظف مطلوبون" },
        { status: 400 }
      );
    }

    const [project, assignee] = await Promise.all([
      prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { id: true } }),
      prisma.user.findFirst({ where: { id: assigneeId, isActive: true }, select: { id: true } }),
    ]);
    if (!project) {
      return NextResponse.json({ error: "المشروع غير موجود أو موجود في سلة المهملات" }, { status: 404 });
    }
    if (!assignee) {
      return NextResponse.json({ error: "الموظف غير موجود أو غير نشط" }, { status: 404 });
    }

    const task = await prisma.$transaction(async (tx) => {
      await tx.projectMember.upsert({
        where: { userId_projectId: { userId: assigneeId, projectId } },
        update: {},
        create: { userId: assigneeId, projectId },
      });

      const lastTask = await tx.task.aggregate({
        where: { assigneeId, status: "IN_PROGRESS" },
        _max: { executionOrder: true },
      });

      return tx.task.create({
        data: {
          title,
          description,
          projectId,
          assigneeId,
          creatorId: userOrResponse.userId,
          deadline: deadline ? new Date(deadline) : null,
          priority: userOrResponse.role === "EMPLOYEE" ? "MEDIUM" : priority || "MEDIUM",
          executionOrder: (lastTask._max.executionOrder || 0) + 1,
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
          assignee: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } },
        },
      });
    });

    await createAuditLog(
      userOrResponse.userId,
      "CREATE",
      "Task",
      task.id,
      `إنشاء مهمة "${title}" وتعيينها لـ ${task.assignee.name}`
    );

    if (task.assignee.id !== userOrResponse.userId) {
      await createNotification({
        userId: task.assignee.id,
        type: "TASK_ASSIGNED",
        audience: "USER",
        title: "مهمة جديدة مسندة إليك",
        message: `${task.title} · مشروع ${task.project.name}`,
        severity: task.priority === "HIGH" ? "WARNING" : "INFO",
        entityType: "Task",
        entityId: task.id,
        actionUrl: `/tasks?task=${task.id}`,
      });
    } else if (userOrResponse.role === "EMPLOYEE") {
      await notifyAdmins({
        type: "TASK_SELF_CREATED",
        title: "أضاف موظف مهمة لنفسه",
        message: `${task.assignee.name} أضاف "${task.title}" إلى مشروع ${task.project.name}`,
        severity: "INFO",
        entityType: "Task",
        entityId: task.id,
        actionUrl: `/tasks?task=${task.id}`,
      }, userOrResponse.userId);
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Create task error:", error);
    return NextResponse.json({ error: "حدث خطأ في إنشاء المهمة" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const body = await request.json();
    const { id, status, priority, title, description, deadline, reorder } = body;

    if (Array.isArray(reorder)) {
      if (reorder.length < 1 || reorder.length > 500) {
        return NextResponse.json({ error: "قائمة الترتيب غير صحيحة" }, { status: 400 });
      }
      const ids = reorder.map((item: { id?: unknown }) => String(item.id || ""));
      if (ids.some((taskId: string) => !taskId) || new Set(ids).size !== ids.length) {
        return NextResponse.json({ error: "قائمة الترتيب تحتوي مهام غير صالحة" }, { status: 400 });
      }
      const existingTasks = await prisma.task.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true, assigneeId: true, status: true },
      });
      if (
        existingTasks.length !== ids.length ||
        existingTasks.some((task) => task.status !== "IN_PROGRESS") ||
        new Set(existingTasks.map((task) => task.assigneeId)).size !== 1
      ) {
        return NextResponse.json({ error: "يمكن ترتيب مهام قيد التنفيذ لموظف واحد فقط" }, { status: 400 });
      }
      if (userOrResponse.role === "EMPLOYEE" && existingTasks[0].assigneeId !== userOrResponse.userId) {
        return NextResponse.json({ error: "لا يمكنك ترتيب مهام موظف آخر" }, { status: 403 });
      }
      await prisma.$transaction(
        ids.map((taskId: string, index: number) =>
          prisma.task.update({ where: { id: taskId }, data: { executionOrder: index + 1 } })
        )
      );
      await createAuditLog(
        userOrResponse.userId,
        "REORDER_TASKS",
        "Task",
        existingTasks[0].assigneeId,
        `إعادة ترتيب ${ids.length} مهام قيد التنفيذ`
      );
      const assigneeId = existingTasks[0].assigneeId;
      if (assigneeId !== userOrResponse.userId) {
        const firstTask = existingTasks.find((task) => task.id === ids[0]);
        await createNotification({
          userId: assigneeId,
          type: "TASK_ORDER_CHANGED",
          audience: "USER",
          title: "تم تحديث ترتيب تنفيذ مهامك",
          message: firstTask ? `أصبحت "${firstTask.title}" في مقدمة ترتيب التنفيذ` : "راجع ترتيب مهامك الجديد",
          severity: "INFO",
          entityType: "Task",
          entityId: ids[0],
          actionUrl: `/tasks?task=${ids[0]}`,
        });
      }
      return NextResponse.json({ success: true });
    }

    if (!id) {
      return NextResponse.json({ error: "معرف المهمة مطلوب" }, { status: 400 });
    }

    const existingTask = await prisma.task.findUnique({ where: { id } });

    if (!existingTask) {
      return NextResponse.json({ error: "المهمة غير موجودة" }, { status: 404 });
    }

    if (
      userOrResponse.role === "EMPLOYEE" &&
      existingTask.assigneeId !== userOrResponse.userId
    ) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    if (status && userOrResponse.role === "EMPLOYEE") {
      if (existingTask.status === "IN_PROGRESS" && status !== "IN_REVIEW") {
        return NextResponse.json(
          { error: "يمكنك نقل المهمة فقط إلى قيد المراجعة" },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (status === "IN_PROGRESS" && existingTask.status !== "IN_PROGRESS") {
      const lastTask = await prisma.task.aggregate({
        where: { assigneeId: existingTask.assigneeId, status: "IN_PROGRESS" },
        _max: { executionOrder: true },
      });
      updateData.executionOrder = (lastTask._max.executionOrder || 0) + 1;
    }
    if (priority) updateData.priority = priority;
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (deadline) updateData.deadline = new Date(deadline);

    const updated = await prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
    });

    await createAuditLog(
      userOrResponse.userId,
      "UPDATE",
      "Task",
      id,
      `تحديث المهمة: ${Object.keys(updateData).join(", ")}`
    );

    if (status && updated.assignee.id !== userOrResponse.userId) {
      await createNotification({
        userId: updated.assignee.id,
        type: "TASK_STATUS_CHANGED",
        audience: "USER",
        title: status === "COMPLETED" ? "تم اعتماد المهمة" : "تغيّرت حالة المهمة",
        message: `${updated.title} · ${status === "IN_REVIEW" ? "قيد المراجعة" : status === "COMPLETED" ? "مكتملة" : "قيد التنفيذ"}`,
        severity: status === "COMPLETED" ? "SUCCESS" : "INFO",
        entityType: "Task",
        entityId: id,
        actionUrl: `/tasks?task=${id}`,
      });
    }

    if (status === "IN_REVIEW") {
      await notifyAdmins({
        type: "TASK_READY_FOR_REVIEW",
        title: "مهمة جاهزة للمراجعة",
        message: `${updated.assignee.name} أرسل مهمة "${updated.title}" للمراجعة`,
        severity: "WARNING",
        entityType: "Task",
        entityId: id,
        actionUrl: `/tasks?task=${id}`,
      }, userOrResponse.userId);
    }

    if (priority && updated.assignee.id !== userOrResponse.userId) {
      await createNotification({
        userId: updated.assignee.id,
        type: "TASK_PRIORITY_CHANGED",
        audience: "USER",
        title: "تغيّرت أولوية مهمة",
        message: `${updated.title} · ${priority === "HIGH" ? "أولوية عالية" : priority === "MEDIUM" ? "أولوية متوسطة" : "أولوية منخفضة"}`,
        severity: priority === "HIGH" ? "WARNING" : "INFO",
        entityType: "Task",
        entityId: id,
        actionUrl: `/tasks?task=${id}`,
      });
    }

    return NextResponse.json({ task: updated });
  } catch (error) {
    console.error("Update task error:", error);
    return NextResponse.json({ error: "حدث خطأ في تحديث المهمة" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "معرف المهمة مطلوب" }, { status: 400 });
    }

    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true, title: true, assigneeId: true, creatorId: true },
    });

    if (!task) {
      return NextResponse.json({ error: "المهمة غير موجودة" }, { status: 404 });
    }

    const isManager = userOrResponse.role === "ADMIN" || userOrResponse.role === "MANAGER";
    const canDelete = isManager || task.assigneeId === userOrResponse.userId || task.creatorId === userOrResponse.userId;
    if (!canDelete) {
      return NextResponse.json({ error: "لا تملك صلاحية حذف هذه المهمة" }, { status: 403 });
    }

    await prisma.task.delete({ where: { id } });

    await createAuditLog(
      userOrResponse.userId,
      "DELETE",
      "Task",
      id,
      `حذف المهمة "${task.title}"`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete task error:", error);
    return NextResponse.json({ error: "حدث خطأ في حذف المهمة" }, { status: 500 });
  }
}
