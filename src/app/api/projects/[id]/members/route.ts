import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireManager } from "@/lib/auth";
import { createNotification } from "@/lib/utils";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const project = await prisma.project.findFirst({
      where: { id: params.id, deletedAt: null },
    });

    if (!project) {
      return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });
    }

    const members = await prisma.projectMember.findMany({
      where: { projectId: params.id },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ members });
  } catch (error) {
    console.error("Get project members error:", error);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userOrResponse = requireManager(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "معرف المستخدم مطلوب" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findFirst({
      where: { id: params.id, deletedAt: null },
    });

    if (!project) {
      return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });
    }

    const existingMember = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId: params.id } },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: "المستخدم عضو بالفعل في المشروع" },
        { status: 400 }
      );
    }

    const addedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    const member = await prisma.projectMember.create({
      data: {
        userId,
        projectId: params.id,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: userOrResponse.userId,
        action: "ADD",
        entityType: "ProjectMember",
        entityId: member.id,
        details: `إضافة "${addedUser?.name || userId}" إلى مشروع "${project.name}"`,
      },
    });

    if (userId !== userOrResponse.userId) {
      await createNotification({
        userId,
        type: "PROJECT_MEMBER_ADDED",
        audience: "USER",
        title: "تمت إضافتك إلى مشروع",
        message: project.name,
        severity: "INFO",
        entityType: "Project",
        entityId: project.id,
        actionUrl: "/projects",
      });
    }

    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    console.error("Add project member error:", error);
    return NextResponse.json(
      { error: "حدث خطأ في إضافة العضو" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userOrResponse = requireManager(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "معرف المستخدم مطلوب" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findFirst({
      where: { id: params.id, deletedAt: null },
    });

    if (!project) {
      return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });
    }

    const member = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId: params.id } },
      include: {
        user: { select: { name: true } },
      },
    });

    if (!member) {
      return NextResponse.json(
        { error: "المستخدم ليس عضواً في المشروع" },
        { status: 404 }
      );
    }

    const assignedTasks = await prisma.task.count({
      where: { projectId: params.id, assigneeId: userId },
    });
    if (assignedTasks > 0) {
      return NextResponse.json(
        { error: `لا يمكن إزالة العضو لأن لديه ${assignedTasks} مهام مسندة في المشروع` },
        { status: 409 }
      );
    }

    await prisma.projectMember.delete({
      where: { userId_projectId: { userId, projectId: params.id } },
    });

    await prisma.activityLog.create({
      data: {
        userId: userOrResponse.userId,
        action: "REMOVE",
        entityType: "ProjectMember",
        entityId: member.id,
        details: `إزالة "${member.user.name || userId}" من مشروع "${project.name}"`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove project member error:", error);
    return NextResponse.json(
      { error: "حدث خطأ في إزالة العضو" },
      { status: 500 }
    );
  }
}
