import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { createAuditLog, createNotification, notifyAdmins } from "@/lib/utils";

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const status = new URL(request.url).searchParams.get("status");
  const manager = auth.role === "ADMIN" || auth.role === "MANAGER";
  const requests = await prisma.attendanceAdjustment.findMany({
    where: { ...(manager ? {} : { requestedById: auth.userId }), ...(status ? { status } : {}) },
    include: {
      attendance: { select: { id: true, date: true, checkIn: true, checkOut: true, status: true, totalHours: true } },
      requestedBy: { select: { id: true, name: true, email: true } },
      reviewer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ requests });
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json();
    const attendanceId = typeof body.attendanceId === "string" ? body.attendanceId : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!attendanceId || reason.length < 5) return NextResponse.json({ error: "حدد سجل الحضور واكتب سبباً واضحاً" }, { status: 400 });
    const attendance = await prisma.attendance.findUnique({ where: { id: attendanceId } });
    if (!attendance || attendance.userId !== auth.userId) return NextResponse.json({ error: "سجل الحضور غير موجود" }, { status: 404 });
    const pending = await prisma.attendanceAdjustment.findFirst({ where: { attendanceId, status: "PENDING" } });
    if (pending) return NextResponse.json({ error: "يوجد طلب تعديل قيد المراجعة لهذا السجل" }, { status: 409 });
    const requestedCheckIn = parseDate(body.requestedCheckIn);
    const requestedCheckOut = parseDate(body.requestedCheckOut);
    if (!requestedCheckIn && !requestedCheckOut) return NextResponse.json({ error: "أدخل وقت الحضور أو الانصراف المطلوب" }, { status: 400 });
    if (requestedCheckIn && requestedCheckOut && requestedCheckOut <= requestedCheckIn) return NextResponse.json({ error: "وقت الانصراف يجب أن يكون بعد الحضور" }, { status: 400 });
    const adjustment = await prisma.attendanceAdjustment.create({ data: { attendanceId, requestedById: auth.userId, requestedCheckIn, requestedCheckOut, reason } });
    await notifyAdmins({ type: "ATTENDANCE_ADJUSTMENT_REQUESTED", title: "طلب تعديل حضور", message: "أرسل موظف طلباً لتعديل سجل حضور", severity: "WARNING", entityType: "AttendanceAdjustment", entityId: adjustment.id, actionUrl: "/employees" }, auth.userId);
    await createAuditLog(auth.userId, "REQUEST_ATTENDANCE_ADJUSTMENT", "AttendanceAdjustment", adjustment.id, reason);
    return NextResponse.json({ request: adjustment }, { status: 201 });
  } catch (error) {
    console.error("Create attendance adjustment error:", error);
    return NextResponse.json({ error: "تعذر إرسال طلب تعديل الحضور" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!(["ADMIN", "MANAGER"].includes(auth.role))) return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const status = body.status === "APPROVED" || body.status === "REJECTED" ? body.status : "";
    if (!id || !status) return NextResponse.json({ error: "بيانات المراجعة غير مكتملة" }, { status: 400 });
    const adjustment = await prisma.attendanceAdjustment.findUnique({ where: { id }, include: { attendance: true } });
    if (!adjustment || adjustment.status !== "PENDING") return NextResponse.json({ error: "طلب التعديل غير متاح" }, { status: 404 });
    let attendance = adjustment.attendance;
    if (status === "APPROVED") {
      const checkIn = adjustment.requestedCheckIn || attendance.checkIn;
      const checkOut = adjustment.requestedCheckOut || attendance.checkOut;
      const totalHours = checkOut ? Math.round(((checkOut.getTime() - checkIn.getTime()) / 3600000) * 100) / 100 : 0;
      attendance = await prisma.attendance.update({ where: { id: attendance.id }, data: { checkIn, checkOut, totalHours, isActive: !checkOut, status: checkOut ? "COMPLETED" : "PRESENT" } });
    }
    const updated = await prisma.attendanceAdjustment.update({ where: { id }, data: { status, reviewerId: auth.userId, reviewNote: typeof body.reviewNote === "string" ? body.reviewNote.trim() : null } });
    await createNotification({ userId: adjustment.requestedById, type: status === "APPROVED" ? "ATTENDANCE_ADJUSTMENT_APPROVED" : "ATTENDANCE_ADJUSTMENT_REJECTED", audience: "USER", title: status === "APPROVED" ? "تم قبول تعديل الحضور" : "تم رفض تعديل الحضور", message: body.reviewNote || "تمت مراجعة طلب تعديل الحضور", severity: status === "APPROVED" ? "SUCCESS" : "DANGER", entityType: "AttendanceAdjustment", entityId: id, actionUrl: "/my-day" });
    await createAuditLog(auth.userId, status === "APPROVED" ? "APPROVE_ATTENDANCE_ADJUSTMENT" : "REJECT_ATTENDANCE_ADJUSTMENT", "AttendanceAdjustment", id, body.reviewNote);
    return NextResponse.json({ request: updated, attendance });
  } catch (error) {
    console.error("Review attendance adjustment error:", error);
    return NextResponse.json({ error: "تعذر مراجعة طلب تعديل الحضور" }, { status: 500 });
  }
}
