import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 15, 1), 50);
    const unreadOnly = searchParams.get("unread") === "true";
    const currentUser = await prisma.user.findUnique({
      where: { id: userOrResponse.userId },
      select: { role: true, isActive: true },
    });
    if (!currentUser?.isActive) {
      return NextResponse.json({ error: "الحساب غير نشط" }, { status: 403 });
    }
    const allowedAudiences =
      currentUser.role === "ADMIN" || currentUser.role === "MANAGER" ? ["USER", "ADMIN", "MANAGEMENT"] :
      ["USER", "EMPLOYEE"];
    const where = {
      userId: userOrResponse.userId,
      audience: { in: allowedAudiences },
      ...(unreadOnly ? { isRead: false } : {}),
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.count({
        where: {
          userId: userOrResponse.userId,
          audience: { in: allowedAudiences },
          isRead: false,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
    ]);
    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error("Get notifications error:", error);
    return NextResponse.json({ error: "تعذر تحميل الإشعارات" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const { id, readAll } = await request.json();
    const readAt = new Date();
    if (readAll) {
      await prisma.notification.updateMany({
        where: { userId: userOrResponse.userId, isRead: false },
        data: { isRead: true, readAt },
      });
      return NextResponse.json({ success: true });
    }
    if (!id) return NextResponse.json({ error: "معرف الإشعار مطلوب" }, { status: 400 });
    const result = await prisma.notification.updateMany({
      where: { id, userId: userOrResponse.userId },
      data: { isRead: true, readAt },
    });
    if (!result.count) return NextResponse.json({ error: "الإشعار غير موجود" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Read notification error:", error);
    return NextResponse.json({ error: "تعذر تحديث الإشعار" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const searchParams = new URL(request.url).searchParams;
    const id = searchParams.get("id");
    if (searchParams.get("read") === "true") {
      const result = await prisma.notification.deleteMany({
        where: { userId: userOrResponse.userId, isRead: true },
      });
      return NextResponse.json({ success: true, deleted: result.count });
    }
    if (!id) return NextResponse.json({ error: "معرف الإشعار مطلوب" }, { status: 400 });
    const result = await prisma.notification.deleteMany({ where: { id, userId: userOrResponse.userId } });
    if (!result.count) return NextResponse.json({ error: "الإشعار غير موجود" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete notification error:", error);
    return NextResponse.json({ error: "تعذر حذف الإشعار" }, { status: 500 });
  }
}
