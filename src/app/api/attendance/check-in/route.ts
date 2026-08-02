import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEmployee } from "@/lib/auth";
import { getTodayDateForTimezone, getTodayAttendance, createAuditLog } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const userOrResponse = requireEmployee(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const existing = await getTodayAttendance(userOrResponse.userId);

    if (existing) {
      return NextResponse.json(
        { error: "لقد سجّلت حضورك اليوم بالفعل", attendance: existing },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userOrResponse.userId },
      select: { timezone: true },
    });

    if (!user) {
      return NextResponse.json({ error: "مستخدم غير موجود" }, { status: 404 });
    }
    const today = getTodayDateForTimezone(user.timezone);

    const now = new Date();
    const localNow = new Date(now.toLocaleString("en-US", { timeZone: user.timezone }));
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { dailyWorkHours: true, workStartMinutes: true, lateGraceMinutes: true, earlyCheckInMinutes: true, hourlyCheckInterval: true, workingDays: true },
    });
    const workStartMinutes = settings?.workStartMinutes ?? 480;
    const workStartHour = Math.floor(workStartMinutes / 60);
    const workStartMinute = workStartMinutes % 60;
    const workEndMinutes = workStartMinutes + Math.round((settings?.dailyWorkHours || 8) * 60);
    const WORK_END = Math.floor(workEndMinutes / 60);
    const workingDays: number[] = settings ? JSON.parse(settings.workingDays) : [0, 1, 2, 3, 4];

    if (!workingDays.includes(localNow.getDay())) {
      return NextResponse.json({ error: "اليوم ليس ضمن أيام العمل المعتمدة" }, { status: 400 });
    }

    const localMinutes = localNow.getHours() * 60 + localNow.getMinutes();
    if (localMinutes < workStartMinutes - (settings?.earlyCheckInMinutes ?? 60) || localMinutes >= workEndMinutes) {
      return NextResponse.json(
        { error: `التسجيل متاح من ${String(workStartHour).padStart(2, "0")}:${String(workStartMinute).padStart(2, "0")} حتى نهاية الدوام بتوقيتك المحلي` },
        { status: 400 }
      );
    }

    const approvedLeave = await prisma.leaveRequest.findFirst({
      where: { userId: userOrResponse.userId, status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } },
      select: { id: true },
    });
    if (approvedLeave) return NextResponse.json({ error: "لديك إجازة معتمدة لهذا اليوم ولا يلزم تسجيل الحضور" }, { status: 400 });

    const lateMinutes = Math.max(0, localMinutes - workStartMinutes - (settings?.lateGraceMinutes ?? 15));

    const attendance = await prisma.attendance.create({
      data: {
        userId: userOrResponse.userId,
        date: today,
        checkIn: now,
        expectedHours: settings?.dailyWorkHours || 8,
        status: lateMinutes > 0 ? "LATE" : "PRESENT",
        lateMinutes,
        isActive: true,
      },
    });

    const CHECK_INTERVAL = settings?.hourlyCheckInterval || 60;
    const hourlyChecks = [];

    for (
      let scheduledLocal = new Date(localNow.getTime() + CHECK_INTERVAL * 60 * 1000);
      scheduledLocal.getHours() + scheduledLocal.getMinutes() / 60 <= WORK_END;
      scheduledLocal = new Date(scheduledLocal.getTime() + CHECK_INTERVAL * 60 * 1000)
    ) {
      const offsetMs = now.getTime() - localNow.getTime();
      const scheduledUTC = new Date(scheduledLocal.getTime() + offsetMs);

      hourlyChecks.push(
        prisma.hourlyCheck.create({
          data: {
            userId: userOrResponse.userId,
            attendanceId: attendance.id,
            scheduledAt: scheduledUTC,
          },
        })
      );
    }

    await Promise.all(hourlyChecks);

    await createAuditLog(
      userOrResponse.userId,
      "CHECK_IN",
      "Attendance",
      attendance.id,
      `تسجيل حضور في ${now.toLocaleTimeString("ar")}`
    );

    const result = await prisma.attendance.findUnique({
      where: { id: attendance.id },
      include: { hourlyChecks: { orderBy: { scheduledAt: "asc" } } },
    });

    return NextResponse.json({ attendance: result, lateMinutes });
  } catch (error) {
    console.error("Check-in error:", error);
    return NextResponse.json({ error: "حدث خطأ في تسجيل الحضور" }, { status: 500 });
  }
}
