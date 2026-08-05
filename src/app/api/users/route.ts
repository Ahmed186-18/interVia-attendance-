import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, requireAuth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { createAuditLog } from "@/lib/utils";

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pass = "";
  for (let i = 0; i < 10; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

export async function GET(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        country: true,
        timezone: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Get users error:", error);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userOrResponse = requireManager(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { name, username, country, timezone, role } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "اسم الموظف مطلوب" },
        { status: 400 }
      );
    }

    if (!username || !username.trim()) {
      return NextResponse.json(
        { error: "اسم المستخدم مطلوب" },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9._]/g, "");
    const email = `${cleanUsername}@intervia.com`;

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return NextResponse.json(
        { error: "اسم المستخدم هذا مستخدم بالفعل" },
        { status: 400 }
      );
    }

    if (role === "ADMIN") {
      return NextResponse.json({ error: "لا تملك صلاحية إنشاء حساب بهذا الدور" }, { status: 403 });
    }

    const normalizedRole = role === "MANAGER" ? "MANAGER" : "EMPLOYEE";
    const password = generatePassword();
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email,
        password: hashedPassword,
        role: normalizedRole,
        country: country || "غير محدد",
        timezone: timezone || "Asia/Qatar",
        locale: "ar",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        country: true,
        timezone: true,
      },
    });

    await createAuditLog(
      userOrResponse.userId,
      "CREATE_USER",
      "User",
      newUser.id,
      `إنشاء حساب ${newUser.name} بدور ${normalizedRole}`
    );

    return NextResponse.json(
      { user: newUser, tempPassword: password },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create user error:", error);
    return NextResponse.json({ error: "حدث خطأ في إنشاء الموظف" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const userOrResponse = requireManager(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { id, action } = await request.json();
    if (!id || !["ACTIVATE", "RESET_PASSWORD"].includes(action)) {
      return NextResponse.json({ error: "بيانات الإجراء غير صحيحة" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: "الموظف غير موجود" }, { status: 404 });

    if (action === "RESET_PASSWORD") {
      if (target.role === "ADMIN") {
        return NextResponse.json({ error: "لا يمكن إعادة تعيين كلمة مرور مدير النظام من هنا" }, { status: 400 });
      }

      const tempPassword = generatePassword();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      await prisma.user.update({
        where: { id },
        data: { password: hashedPassword },
      });
      await createAuditLog(
        userOrResponse.userId,
        "RESET_USER_PASSWORD",
        "User",
        id,
        `إعادة تعيين كلمة مرور ${target.name}`
      );
      return NextResponse.json({
        success: true,
        tempPassword,
        user: { id: target.id, name: target.name, email: target.email },
      });
    }

    if (target.role === "ADMIN") {
      return NextResponse.json({ error: "لا تملك صلاحية تفعيل هذا الحساب" }, { status: 403 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: true },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    await createAuditLog(userOrResponse.userId, "ACTIVATE_USER", "User", id, `إعادة تفعيل حساب ${updated.name}`);
    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error("Activate user error:", error);
    return NextResponse.json({ error: "تعذر إعادة تفعيل الحساب" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const userOrResponse = requireManager(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "معرف الموظف مطلوب" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({ where: { id } });

    if (!targetUser) {
      return NextResponse.json({ error: "الموظف غير موجود" }, { status: 404 });
    }

    if (targetUser.role === "ADMIN") {
      return NextResponse.json({ error: "لا يمكن حذف المدير العام" }, { status: 400 });
    }

    if (targetUser.id === userOrResponse.userId) {
      return NextResponse.json({ error: "لا يمكنك حذف نفسك" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    await createAuditLog(userOrResponse.userId, "DEACTIVATE_USER", "User", id, `إيقاف حساب ${targetUser.name}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json({ error: "حدث خطأ في حذف الموظف" }, { status: 500 });
  }
}
