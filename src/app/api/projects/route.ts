import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireManager } from "@/lib/auth";
import { createAuditLog, createNotification } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const trash = new URL(request.url).searchParams.get("trash") === "true";
    if (trash && !["MANAGER", "ADMIN"].includes(userOrResponse.role)) {
      return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
    }

    const projects = await prisma.project.findMany({
      where: trash ? { deletedAt: { not: null } } : { deletedAt: null },
      include: {
        _count: { select: { tasks: true, members: true } },
        tasks: { select: { status: true } },
      },
      orderBy: trash ? { deletedAt: "desc" } : { createdAt: "desc" },
    });

    const projectsWithStats = projects.map((project) => ({
      id: project.id,
      name: project.name,
      code: project.code,
      clientName: project.clientName,
      clientCode: project.clientCode,
      description: project.description,
      deadline: project.deadline,
      createdAt: project.createdAt,
      deletedAt: project.deletedAt,
      totalTasks: project._count.tasks,
      totalMembers: project._count.members,
      completedTasks: project.tasks.filter((task) => task.status === "COMPLETED").length,
      inProgressTasks: project.tasks.filter((task) => task.status === "IN_PROGRESS").length,
      inReviewTasks: project.tasks.filter((task) => task.status === "IN_REVIEW").length,
    }));

    return NextResponse.json({ projects: projectsWithStats });
  } catch (error) {
    console.error("Get projects error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء تحميل المشاريع" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userOrResponse = requireManager(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { name, description, deadline, memberIds } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: "اسم المشروع مطلوب" }, { status: 400 });
    }

    const uniqueMembers = Array.from(new Set<string>([userOrResponse.userId, ...(memberIds || [])]));
    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        deadline: deadline ? new Date(`${deadline}T00:00:00`) : null,
        members: { create: uniqueMembers.map((userId) => ({ userId })) },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });

    await createAuditLog(userOrResponse.userId, "CREATE", "Project", project.id, `إنشاء مشروع "${project.name}"`);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Create project error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء إنشاء المشروع" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const userOrResponse = requireManager(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { id, name, description, deadline, action } = await request.json();
    if (!id) return NextResponse.json({ error: "معرف المشروع مطلوب" }, { status: 400 });

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });

    if (action === "RESTORE") {
      if (!existing.deletedAt) {
        return NextResponse.json({ error: "المشروع غير موجود في سلة المهملات" }, { status: 409 });
      }
      const restored = await prisma.project.update({ where: { id }, data: { deletedAt: null } });
      await createAuditLog(userOrResponse.userId, "RESTORE", "Project", id, `استعادة مشروع "${existing.name}"`);
      const members = await prisma.projectMember.findMany({ where: { projectId: id }, select: { userId: true } });
      await Promise.all(
        members
          .filter((member) => member.userId !== userOrResponse.userId)
          .map((member) =>
            createNotification({
              userId: member.userId,
              type: "PROJECT_RESTORED",
              audience: "USER",
              title: "تمت استعادة مشروع",
              message: `أصبح مشروع "${existing.name}" نشطًا من جديد`,
              severity: "SUCCESS",
              entityType: "Project",
              entityId: id,
              actionUrl: "/projects",
            })
          )
      );
      return NextResponse.json({ project: restored });
    }

    if (existing.deletedAt) {
      return NextResponse.json({ error: "استعد المشروع قبل تعديله" }, { status: 409 });
    }
    const updated = await prisma.project.update({
      where: { id },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
        ...(deadline !== undefined ? { deadline: deadline ? new Date(`${deadline}T00:00:00`) : null } : {}),
      },
    });
    await createAuditLog(userOrResponse.userId, "UPDATE", "Project", id, `تحديث مشروع "${updated.name}"`);
    return NextResponse.json({ project: updated });
  } catch (error) {
    console.error("Update project error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء تحديث المشروع" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const userOrResponse = requireManager(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "معرف المشروع مطلوب" }, { status: 400 });
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });
    if (project.deletedAt) {
      return NextResponse.json({ error: "المشروع موجود في سلة المهملات بالفعل" }, { status: 409 });
    }

    const deleted = await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
    await createAuditLog(userOrResponse.userId, "TRASH", "Project", id, `نقل مشروع "${project.name}" إلى سلة المهملات`);
    const members = await prisma.projectMember.findMany({ where: { projectId: id }, select: { userId: true } });
    await Promise.all(
      members
        .filter((member) => member.userId !== userOrResponse.userId)
        .map((member) =>
          createNotification({
            userId: member.userId,
            type: "PROJECT_TRASHED",
            audience: "USER",
            title: "تم إيقاف مشروع",
            message: `نُقل مشروع "${project.name}" إلى سلة المهملات`,
            severity: "WARNING",
            entityType: "Project",
            entityId: id,
            actionUrl: "/projects",
          })
        )
    );
    return NextResponse.json({ project: deleted, success: true });
  } catch (error) {
    console.error("Trash project error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء نقل المشروع إلى السلة" }, { status: 500 });
  }
}
