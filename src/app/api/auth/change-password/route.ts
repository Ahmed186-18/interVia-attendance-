import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { createAuditLog } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json({ error: "كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { password: true } });
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return NextResponse.json({ error: "كلمة المرور الحالية غير صحيحة" }, { status: 400 });
    }
    const password = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: auth.userId }, data: { password } });
    await createAuditLog(auth.userId, "CHANGE_PASSWORD", "User", auth.userId, "تغيير كلمة مرور الحساب");
    return NextResponse.json({ message: "تم تغيير كلمة المرور بنجاح" });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json({ error: "تعذر تغيير كلمة المرور" }, { status: 500 });
  }
}
