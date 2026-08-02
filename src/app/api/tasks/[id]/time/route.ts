import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getTodayAttendance } from "@/lib/utils";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { id } = await params;

    const entries = await prisma.timeEntry.findMany({
      where: { taskId: id },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: "desc" },
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Get time entries error:", error);
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
    const { id } = await params;
    const { note } = await request.json().catch(() => ({}));

    const task = await prisma.task.findUnique({ where: { id } });

    if (!task) {
      return NextResponse.json({ error: "المهمة غير موجودة" }, { status: 404 });
    }

    if (userOrResponse.role === "EMPLOYEE" && task.assigneeId !== userOrResponse.userId) {
      return NextResponse.json({ error: "يمكنك تسجيل الوقت على مهامك فقط" }, { status: 403 });
    }

    if (userOrResponse.role === "EMPLOYEE") {
      const attendance = await getTodayAttendance(userOrResponse.userId);
      if (!attendance?.isActive || attendance.checkOut) {
        return NextResponse.json({ error: "يجب تسجيل الحضور قبل بدء مؤقت المهمة" }, { status: 400 });
      }
    }

    const activeEntry = await prisma.timeEntry.findFirst({
      where: {
        userId: userOrResponse.userId,
        endedAt: null,
      },
    });

    if (activeEntry) {
      return NextResponse.json(
        { error: "يوجد جلسة وقت نشطة يجب إيقافها أولاً" },
        { status: 400 }
      );
    }

    const entry = await prisma.timeEntry.create({
      data: {
        taskId: id,
        userId: userOrResponse.userId,
        startedAt: new Date(),
        note: note || null,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error("Start time entry error:", error);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { id } = await params;
    const { id: entryId } = await request.json();

    if (!entryId) {
      return NextResponse.json(
        { error: "معرف الجلسة مطلوب" },
        { status: 400 }
      );
    }

    const entry = await prisma.timeEntry.findUnique({
      where: { id: entryId },
    });

    if (!entry) {
      return NextResponse.json(
        { error: "جلسة الوقت غير موجودة" },
        { status: 404 }
      );
    }

    if (entry.taskId !== id) {
      return NextResponse.json(
        { error: "جلسة الوقت غير تابعة لهذه المهمة" },
        { status: 400 }
      );
    }

    if (entry.userId !== userOrResponse.userId) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    if (entry.endedAt) {
      return NextResponse.json(
        { error: "جلسة الوقت تم إيقافها بالفعل" },
        { status: 400 }
      );
    }

    const now = new Date();
    const duration = (now.getTime() - entry.startedAt.getTime()) / (1000 * 60 * 60);

    const updated = await prisma.timeEntry.update({
      where: { id: entryId },
      data: {
        endedAt: now,
        duration,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ entry: updated });
  } catch (error) {
    console.error("Stop time entry error:", error);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}
