import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireManager } from "@/lib/auth";
import { createAuditLog, createNotification, notifyAdmins } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const status = new URL(request.url).searchParams.get("status");
    const [requests, settings] = await Promise.all([
      prisma.overtimeRequest.findMany({
        where: {
          ...(userOrResponse.role === "EMPLOYEE" ? { userId: userOrResponse.userId } : {}),
          ...(status ? { status } : {}),
        },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.systemSettings.findUnique({ where: { id: "default" }, select: { overtimeMaxHours: true } }),
    ]);
    return NextResponse.json({ requests, maxHours: settings?.overtimeMaxHours || 12 });
  } catch (error) {
    console.error("Get overtime error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء تحميل الطلبات" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { hours, reason, workDate } = await request.json();
    const numericHours = Number(hours);
    const parsedWorkDate = workDate ? new Date(`${workDate}T00:00:00`) : null;
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { overtimeMaxHours: true },
    });
    const maxHours = settings?.overtimeMaxHours || 12;

    if (!Number.isFinite(numericHours) || numericHours <= 0 || numericHours > maxHours) {
      return NextResponse.json(
        { error: `عدد الساعات يجب أن يكون أكبر من صفر ولا يتجاوز ${maxHours} ساعة` },
        { status: 400 }
      );
    }
    if (!parsedWorkDate || Number.isNaN(parsedWorkDate.getTime())) {
      return NextResponse.json({ error: "تاريخ العمل الإضافي مطلوب" }, { status: 400 });
    }
    if (!reason || reason.trim().length < 5) {
      return NextResponse.json({ error: "يرجى توضيح سبب العمل الإضافي" }, { status: 400 });
    }

    const overtimeRequest = await prisma.overtimeRequest.create({
      data: {
        userId: userOrResponse.userId,
        hours: numericHours,
        workDate: parsedWorkDate,
        reason: reason.trim(),
        status: "PENDING",
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    await createAuditLog(
      userOrResponse.userId,
      "CREATE_OVERTIME",
      "OvertimeRequest",
      overtimeRequest.id,
      `طلب ${numericHours} ساعات إضافية`
    );
    await notifyAdmins(
      {
        type: "OVERTIME_REQUESTED",
        title: "طلب ساعات إضافية جديد",
        message: `${overtimeRequest.user.name} طلب ${numericHours} ساعات إضافية`,
        severity: "WARNING",
        entityType: "OvertimeRequest",
        entityId: overtimeRequest.id,
        actionUrl: `/requests?type=overtime&id=${overtimeRequest.id}`,
      },
      userOrResponse.userId
    );
    return NextResponse.json({ request: overtimeRequest }, { status: 201 });
  } catch (error) {
    console.error("Create overtime error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء إنشاء الطلب" }, { status: 500 });
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

    const existing = await prisma.overtimeRequest.findUnique({
      where: { id },
      include: { user: { select: { name: true } } },
    });
    if (!existing) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    if (existing.status !== "PENDING") {
      return NextResponse.json({ error: "تم اتخاذ قرار على هذا الطلب مسبقًا" }, { status: 409 });
    }

    const updated = await prisma.overtimeRequest.update({
      where: { id },
      data: { status, managerNote: managerNote?.trim() || null },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    await createAuditLog(
      userOrResponse.userId,
      status === "APPROVED" ? "APPROVE_OVERTIME" : "REJECT_OVERTIME",
      "OvertimeRequest",
      id,
      `${status === "APPROVED" ? "الموافقة على" : "رفض"} طلب ساعات ${existing.user.name}`
    );
    if (updated.user.id !== userOrResponse.userId) {
      await createNotification({
        userId: updated.user.id,
        type: status === "APPROVED" ? "OVERTIME_APPROVED" : "OVERTIME_REJECTED",
        audience: "USER",
        title: status === "APPROVED" ? "تمت الموافقة على الساعات الإضافية" : "تم رفض طلب الساعات الإضافية",
        message: `${updated.hours} ساعات بتاريخ ${updated.workDate.toLocaleDateString("ar")}${updated.managerNote ? ` · ${updated.managerNote}` : ""}`,
        severity: status === "APPROVED" ? "SUCCESS" : "DANGER",
        entityType: "OvertimeRequest",
        entityId: id,
        actionUrl: `/requests?type=overtime&id=${id}`,
      });
    }
    return NextResponse.json({ request: updated });
  } catch (error) {
    console.error("Update overtime error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء تحديث الطلب" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "معرف الطلب مطلوب" }, { status: 400 });
    const existing = await prisma.overtimeRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    if (existing.userId !== userOrResponse.userId || existing.status !== "PENDING") {
      return NextResponse.json({ error: "يمكن إلغاء طلباتك المعلقة فقط" }, { status: 403 });
    }
    await prisma.overtimeRequest.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete overtime error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء إلغاء الطلب" }, { status: 500 });
  }
}
