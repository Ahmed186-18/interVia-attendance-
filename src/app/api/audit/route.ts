import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = requireManager(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const logs = await prisma.auditLog.findMany({
      take: 40,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Get audit logs error:", error);
    return NextResponse.json({ error: "تعذر تحميل سجل النشاط" }, { status: 500 });
  }
}
