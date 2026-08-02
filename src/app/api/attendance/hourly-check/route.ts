import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getTodayAttendance, createAuditLog, createNotification } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { checkId } = await request.json();

    if (!checkId) {
      return NextResponse.json({ error: "معرف الإشعار مطلوب" }, { status: 400 });
    }

    const attendance = await getTodayAttendance(userOrResponse.userId);

    if (!attendance) {
      return NextResponse.json(
        { error: "لم تسجّل حضورك اليوم" },
        { status: 400 }
      );
    }

    const hourlyCheck = await prisma.hourlyCheck.findUnique({
      where: { id: checkId },
    });

    if (!hourlyCheck || hourlyCheck.userId !== userOrResponse.userId) {
      return NextResponse.json(
        { error: "إشعار غير موجود أو غير مصرح" },
        { status: 404 }
      );
    }

    if (hourlyCheck.isConfirmed) {
      return NextResponse.json(
        { error: "تم تأكيد هذا الإشعار بالفعل" },
        { status: 400 }
      );
    }

    const now = new Date();
    const scheduledTime = new Date(hourlyCheck.scheduledAt);
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { hourlyCheckWindow: true },
    });
    const confirmationWindow = (settings?.hourlyCheckWindow || 15) * 60 * 1000;

    const isLate = now.getTime() - scheduledTime.getTime() > confirmationWindow;

    const updated = await prisma.hourlyCheck.update({
      where: { id: checkId },
      data: {
        confirmedAt: now,
        isConfirmed: true,
        isDeducted: isLate,
      },
    });

    await createAuditLog(
      userOrResponse.userId,
      isLate ? "HOURLY_CHECK_LATE" : "HOURLY_CHECK_CONFIRMED",
      "HourlyCheck",
      checkId,
      isLate
        ? `تأكيد متأخر — تم خصم ساعة`
        : `تأكيد في الوقت — ${now.toLocaleTimeString("ar")}`
    );

    if (isLate) {
      await createNotification({
        userId: userOrResponse.userId,
        type: "HOURLY_CHECK_LATE",
        audience: "USER",
        title: "تم تسجيل تأكيد متأخر",
        message: "انتهت مهلة التأكيد وتم احتساب ساعة خصم",
        severity: "DANGER",
        entityType: "HourlyCheck",
        entityId: checkId,
        actionUrl: "/my-day",
      });
    }

    return NextResponse.json({ check: updated, isLate });
  } catch (error) {
    console.error("Hourly check error:", error);
    return NextResponse.json({ error: "حدث خطأ في تأكيد الإشعار" }, { status: 500 });
  }
}
