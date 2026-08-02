import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  const user = await prisma.user.findUnique({
    where: { id: userOrResponse.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      country: true,
      timezone: true,
      locale: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
  }

  return NextResponse.json({ user });
}
