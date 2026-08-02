import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEmployee } from "@/lib/auth";
import { getTodayAttendance, createAuditLog } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const userOrResponse = requireEmployee(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const attendance = await getTodayAttendance(userOrResponse.userId);

    if (!attendance) {
      return NextResponse.json(
        { error: "لم تسجّل حضورك اليوم بعد" },
        { status: 400 }
      );
    }

    if (attendance.checkOut) {
      return NextResponse.json(
        { error: "لقد سجّلت انصرافك بالفعل اليوم" },
        { status: 400 }
      );
    }

    const now = new Date();
    const elapsedMilliseconds = now.getTime() - new Date(attendance.checkIn).getTime();
    const minimumWorkMilliseconds = 60 * 60 * 1000;
    if (elapsedMilliseconds < minimumWorkMilliseconds) {
      const remainingMinutes = Math.ceil((minimumWorkMilliseconds - elapsedMilliseconds) / 60000);
      return NextResponse.json(
        { error: `لا يمكن تسجيل الانصراف قبل إكمال ساعة من الدوام. متبقٍ تقريباً ${remainingMinutes} دقيقة.` },
        { status: 400 }
      );
    }
    const totalHours = Math.round(
      elapsedMilliseconds / (1000 * 60 * 60) * 100
    ) / 100;

    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { dailyWorkHours: true, workStartMinutes: true },
    });
    const localNow = new Date(now.toLocaleString("en-US", { timeZone: (await prisma.user.findUnique({ where: { id: userOrResponse.userId }, select: { timezone: true } }))?.timezone || "Asia/Hebron" }));
    const workEndMinutes = (settings?.workStartMinutes ?? 480) + Math.round((settings?.dailyWorkHours || 8) * 60);
    const earlyLeaveMinutes = Math.max(0, workEndMinutes - (localNow.getHours() * 60 + localNow.getMinutes()));

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOut: now,
        totalHours,
        earlyLeaveMinutes,
        status: earlyLeaveMinutes > 0 ? "EARLY_LEAVE" : "COMPLETED",
        isActive: false,
      },
      include: { hourlyChecks: { orderBy: { scheduledAt: "asc" } } },
    });

    await createAuditLog(
      userOrResponse.userId,
      "CHECK_OUT",
      "Attendance",
      attendance.id,
      `تسجيل انصراف — إجمالي الساعات: ${totalHours}`
    );

    return NextResponse.json({ attendance: updated });
  } catch (error) {
    console.error("Check-out error:", error);
    return NextResponse.json({ error: "حدث خطأ في تسجيل الانصراف" }, { status: 500 });
  }
}
