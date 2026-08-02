import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireManager } from "@/lib/auth";
import { createAuditLog, createNotification, notifyAdmins } from "@/lib/utils";

const leaveTypes = ["ANNUAL", "SICK", "UNPAID", "EMERGENCY"];

function parseDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function workingDays(start: Date, end: Date, allowedDays: number[]) {
  let days = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (allowedDays.includes(day)) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export async function GET(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const status = new URL(request.url).searchParams.get("status");
    const requests = await prisma.leaveRequest.findMany({
      where: {
        ...(userOrResponse.role === "EMPLOYEE" ? { userId: userOrResponse.userId } : {}),
        ...(status ? { status } : {}),
      },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Get leave requests error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء تحميل طلبات الإجازة" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { type, startDate, endDate, reason } = await request.json();
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { workingDays: true, annualLeaveDays: true },
    });
    const allowedDays: number[] = settings ? JSON.parse(settings.workingDays) : [0, 1, 2, 3, 4];
    if (!leaveTypes.includes(type)) {
      return NextResponse.json({ error: "نوع الإجازة غير صحيح" }, { status: 400 });
    }
    if (!start || !end || end < start) {
      return NextResponse.json({ error: "يرجى اختيار فترة إجازة صحيحة" }, { status: 400 });
    }
    const days = workingDays(start, end, allowedDays);
    if (days < 1) {
      return NextResponse.json({ error: "الفترة المحددة لا تحتوي على أيام عمل" }, { status: 400 });
    }
    if (!reason || reason.trim().length < 5) {
      return NextResponse.json({ error: "يرجى توضيح سبب الإجازة" }, { status: 400 });
    }
    if (type === "ANNUAL") {
      const yearStart = new Date(start.getFullYear(), 0, 1);
      const yearEnd = new Date(start.getFullYear(), 11, 31, 23, 59, 59);
      const used = await prisma.leaveRequest.aggregate({
        where: {
          userId: userOrResponse.userId,
          type: "ANNUAL",
          status: { in: ["PENDING", "APPROVED"] },
          startDate: { gte: yearStart, lte: yearEnd },
        },
        _sum: { days: true },
      });
      const balance = settings?.annualLeaveDays ?? 21;
      if ((used._sum.days || 0) + days > balance) {
        return NextResponse.json({ error: `الطلب يتجاوز رصيد الإجازة السنوي المتبقي (${Math.max(0, balance - (used._sum.days || 0))} يوم)` }, { status: 400 });
      }
    }

    const overlapping = await prisma.leaveRequest.findFirst({
      where: {
        userId: userOrResponse.userId,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });
    if (overlapping) {
      return NextResponse.json({ error: "يوجد طلب إجازة آخر يتداخل مع هذه الفترة" }, { status: 409 });
    }

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        userId: userOrResponse.userId,
        type,
        startDate: start,
        endDate: end,
        days,
        reason: reason.trim(),
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    await createAuditLog(
      userOrResponse.userId,
      "CREATE_LEAVE",
      "LeaveRequest",
      leaveRequest.id,
      `طلب إجازة لمدة ${days} أيام`
    );
    await notifyAdmins(
      {
        type: "LEAVE_REQUESTED",
        title: "طلب إجازة جديد",
        message: `${leaveRequest.user.name} طلب إجازة لمدة ${days} أيام عمل`,
        severity: "WARNING",
        entityType: "LeaveRequest",
        entityId: leaveRequest.id,
        actionUrl: `/requests?type=leave&id=${leaveRequest.id}`,
      },
      userOrResponse.userId
    );
    return NextResponse.json({ request: leaveRequest }, { status: 201 });
  } catch (error) {
    console.error("Create leave request error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء إنشاء طلب الإجازة" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const userOrResponse = requireManager(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { id, status, managerNote } = await request.json();
    if (!id || !["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "بيانات القرار غير صحيحة" }, { status: 400 });
    }
    const existing = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { user: { select: { name: true } } },
    });
    if (!existing) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    if (existing.status !== "PENDING") {
      return NextResponse.json({ error: "تم اتخاذ قرار على هذا الطلب مسبقًا" }, { status: 409 });
    }

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: { status, managerNote: managerNote?.trim() || null, reviewedAt: new Date() },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    await createAuditLog(
      userOrResponse.userId,
      status === "APPROVED" ? "APPROVE_LEAVE" : "REJECT_LEAVE",
      "LeaveRequest",
      id,
      `${status === "APPROVED" ? "الموافقة على" : "رفض"} إجازة ${existing.user.name}`
    );
    if (updated.user.id !== userOrResponse.userId) {
      await createNotification({
        userId: updated.user.id,
        type: status === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
        audience: "USER",
        title: status === "APPROVED" ? "تمت الموافقة على الإجازة" : "تم رفض طلب الإجازة",
        message: `${updated.days} أيام عمل${updated.managerNote ? ` · ${updated.managerNote}` : ""}`,
        severity: status === "APPROVED" ? "SUCCESS" : "DANGER",
        entityType: "LeaveRequest",
        entityId: id,
        actionUrl: `/requests?type=leave&id=${id}`,
      });
    }
    return NextResponse.json({ request: updated });
  } catch (error) {
    console.error("Review leave request error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء تحديث الطلب" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "معرف الطلب مطلوب" }, { status: 400 });
    const existing = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    if (existing.userId !== userOrResponse.userId || existing.status !== "PENDING") {
      return NextResponse.json({ error: "يمكن إلغاء طلباتك المعلقة فقط" }, { status: 403 });
    }
    await prisma.leaveRequest.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete leave request error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء إلغاء الطلب" }, { status: 500 });
  }
}
