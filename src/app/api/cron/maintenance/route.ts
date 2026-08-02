import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

function localDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const now = new Date();

  try {
    const settings = await prisma.systemSettings.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
    });
    const activeRecords = await prisma.attendance.findMany({
      where: { isActive: true, checkOut: null },
      include: { user: { select: { id: true, timezone: true, isActive: true } } },
      orderBy: { checkIn: "asc" },
      take: 500,
    });

    let closedAttendance = 0;
    for (const attendance of activeRecords) {
      const timezone = attendance.user.timezone || settings.timezone;
      const currentLocal = localDateParts(now, timezone);
      const checkInLocal = localDateParts(attendance.checkIn, timezone);
      const currentDate = `${currentLocal.year}-${currentLocal.month}-${currentLocal.day}`;
      const checkInDate = `${checkInLocal.year}-${checkInLocal.month}-${checkInLocal.day}`;
      const isPastWorkday = currentDate > checkInDate;
      const reachedCloseHour = currentDate === checkInDate && Number(currentLocal.hour) >= settings.autoCloseHour;
      if (!isPastWorkday && !reachedCloseHour) continue;

      const elapsedHours = Math.max(0, (now.getTime() - attendance.checkIn.getTime()) / 3_600_000);
      const totalHours = Math.round(Math.min(elapsedHours, attendance.expectedHours) * 100) / 100;
      const checkoutAt = isPastWorkday
        ? new Date(attendance.checkIn.getTime() + totalHours * 3_600_000)
        : now;

      const updated = await prisma.attendance.updateMany({
        where: { id: attendance.id, isActive: true, checkOut: null },
        data: {
          checkOut: checkoutAt,
          totalHours,
          isActive: false,
          status: "AUTO_CLOSED",
        },
      });
      if (!updated.count) continue;
      closedAttendance += updated.count;

      if (attendance.user.isActive) {
        await createNotification({
          userId: attendance.user.id,
          audience: "USER",
          type: "ATTENDANCE_AUTO_CLOSED",
          title: "تم إغلاق سجل الحضور تلقائياً",
          message: `أُغلق سجل الدوام تلقائياً بإجمالي ${totalHours} ساعة. يمكنك طلب تعديل السجل عند الحاجة.`,
          severity: "WARNING",
          entityType: "Attendance",
          entityId: attendance.id,
          actionUrl: "/my-day",
        });
      }
    }

    const trashCutoff = new Date(now.getTime() - settings.projectTrashRetentionDays * 86_400_000);
    const deletedProjects = await prisma.project.deleteMany({
      where: { deletedAt: { not: null, lte: trashCutoff } },
    });

    return NextResponse.json({
      ok: true,
      closedAttendance,
      deletedProjects: deletedProjects.count,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("Scheduled maintenance failed:", error);
    return NextResponse.json({ error: "Scheduled maintenance failed" }, { status: 500 });
  }
}
