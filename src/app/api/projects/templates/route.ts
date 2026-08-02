import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const templates = await prisma.projectTemplate.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Get templates error:", error);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  if (userOrResponse.role !== "MANAGER" && userOrResponse.role !== "ADMIN") {
    return NextResponse.json({ error: "غير مصرح — صلاحيات المدير مطلوبة" }, { status: 403 });
  }

  try {
    const { name, description, tasks } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "اسم القالب مطلوب" }, { status: 400 });
    }

    const tasksJson = tasks ? JSON.stringify(tasks) : "[]";

    const template = await prisma.projectTemplate.create({
      data: {
        name,
        description: description || null,
        tasks: tasksJson,
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error("Create template error:", error);
    return NextResponse.json({ error: "حدث خطأ في إنشاء القالب" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  if (userOrResponse.role !== "MANAGER" && userOrResponse.role !== "ADMIN") {
    return NextResponse.json({ error: "غير مصرح — صلاحيات المدير مطلوبة" }, { status: 403 });
  }

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "معرف القالب مطلوب" }, { status: 400 });
    }

    const template = await prisma.projectTemplate.findUnique({ where: { id } });
    if (!template) {
      return NextResponse.json({ error: "القالب غير موجود" }, { status: 404 });
    }

    await prisma.projectTemplate.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete template error:", error);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}
