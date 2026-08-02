import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { createAuditLog } from "@/lib/utils";
import {
  closeDropboxFileRequest,
  createDropboxFileRequest,
  DropboxIntegrationError,
  isDropboxConfigured,
  safeDropboxSegment,
} from "@/lib/dropbox";

export const dynamic = "force-dynamic";

function parsePeriod(value: unknown, type: string) {
  if (typeof value !== "string") return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (type === "MONTHLY") date.setDate(1);
  return date;
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const params = new URL(request.url).searchParams;
    const type = params.get("type");
    const status = params.get("status");
    const projectId = params.get("projectId");
    const userId = params.get("userId");
    const submissions = await prisma.submission.findMany({
      where: {
        ...(auth.role === "EMPLOYEE" ? { userId: auth.userId } : userId ? { userId } : {}),
        ...(type && ["DAILY", "MONTHLY"].includes(type) ? { type } : {}),
        ...(status ? { status } : {}),
        ...(projectId ? { projectId } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
        files: { orderBy: { name: "asc" } },
        revisions: { orderBy: { version: "desc" }, select: { id: true, version: true, status: true, filesJson: true, note: true, createdAt: true } },
      },
      orderBy: [{ periodDate: "desc" }, { createdAt: "desc" }],
      take: 250,
    });
    return NextResponse.json(
      { submissions, dropboxConfigured: await isDropboxConfigured() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Get submissions error:", error);
    return NextResponse.json({ error: "تعذر تحميل التسليمات" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "إنشاء التسليمات متاح للموظفين فقط" }, { status: 403 });
  }
  if (!(await isDropboxConfigured())) {
    return NextResponse.json({ error: "يجب ربط Dropbox من إعدادات الخادم أولاً" }, { status: 503 });
  }

  try {
    const { projectId, type, periodDate, note } = await request.json();
    if (!projectId || !["DAILY", "MONTHLY"].includes(type)) {
      return NextResponse.json({ error: "المشروع ونوع التسليم مطلوبان" }, { status: 400 });
    }
    const period = parsePeriod(periodDate, type);
    if (!period) return NextResponse.json({ error: "تاريخ التسليم غير صحيح" }, { status: 400 });

    const [user, project, duplicate] = await Promise.all([
      prisma.user.findUnique({ where: { id: auth.userId }, select: { name: true } }),
      prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { id: true, name: true } }),
      prisma.submission.findUnique({
        where: { userId_projectId_type_periodDate: { userId: auth.userId, projectId, type, periodDate: period } },
        select: { id: true },
      }),
    ]);
    if (!user || !project) return NextResponse.json({ error: "المستخدم أو المشروع غير موجود" }, { status: 404 });
    if (duplicate) return NextResponse.json({ error: "يوجد تسليم لهذا المشروع والفترة بالفعل" }, { status: 409 });

    const year = period.getFullYear();
    const month = String(period.getMonth() + 1).padStart(2, "0");
    const day = String(period.getDate()).padStart(2, "0");
    const typeFolder = type === "DAILY" ? "Daily" : "Monthly";
    const dateFolder = type === "DAILY" ? `${year}-${month}-${day}` : `${year}-${month}`;
    const destination = `/InterVia Submissions/${safeDropboxSegment(project.name)}/${year}/${month}/${typeFolder}/${safeDropboxSegment(user.name)}/${dateFolder}`;
    const requestTitle = `${type === "DAILY" ? "تسليم يومي" : "تسليم شهري"} - ${user.name} - ${project.name} - ${dateFolder}`;
    const fileRequest = await createDropboxFileRequest({
      title: requestTitle,
      destination,
      description: typeof note === "string" ? note.trim().slice(0, 500) : "",
    });

    try {
      const submission = await prisma.submission.create({
        data: {
          userId: auth.userId,
          projectId,
          type,
          periodDate: period,
          note: typeof note === "string" ? note.trim().slice(0, 1000) || null : null,
          dropboxRequestId: fileRequest.id,
          dropboxRequestUrl: fileRequest.url,
          dropboxFolder: destination,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true } },
          files: true,
        },
      });
      await createAuditLog(auth.userId, "CREATE_SUBMISSION", "Submission", submission.id, requestTitle);
      return NextResponse.json({ submission }, { status: 201 });
    } catch (error) {
      await closeDropboxFileRequest(fileRequest.id).catch(() => null);
      throw error;
    }
  } catch (error) {
    console.error("Create submission error:", error);
    if (error instanceof DropboxIntegrationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "تعذر إنشاء رابط التسليم" }, { status: 500 });
  }
}
