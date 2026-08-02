import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { createAuditLog } from "@/lib/utils";
import { deleteDropboxFile, DropboxIntegrationError, getDropboxTemporaryLink } from "@/lib/dropbox";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const fileId = new URL(request.url).searchParams.get("fileId");
    if (!fileId) return NextResponse.json({ error: "معرف الملف مطلوب" }, { status: 400 });
    const file = await prisma.submissionFile.findFirst({
      where: { id: fileId, submissionId: id },
      include: { submission: { select: { userId: true } } },
    });
    if (!file) return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });
    if (auth.role === "EMPLOYEE" && file.submission.userId !== auth.userId) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    const result = await getDropboxTemporaryLink(file.path);
    return NextResponse.json({ link: result.link });
  } catch (error) {
    console.error("Get submission file error:", error);
    if (error instanceof DropboxIntegrationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "تعذر فتح الملف" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const fileId = new URL(request.url).searchParams.get("fileId");
    if (!fileId) return NextResponse.json({ error: "معرف الملف مطلوب" }, { status: 400 });
    const file = await prisma.submissionFile.findFirst({ where: { id: fileId, submissionId: id }, include: { submission: true } });
    if (!file) return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });
    if (auth.role === "EMPLOYEE" && file.submission.userId !== auth.userId) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    if (!["OPEN", "REVISION_REQUESTED"].includes(file.submission.status)) return NextResponse.json({ error: "أعد فتح التسليم قبل حذف ملف منه" }, { status: 409 });
    await deleteDropboxFile(file.path);
    await prisma.submission.update({ where: { id: file.submissionId }, data: { fileCount: { decrement: 1 } } });
    await prisma.submissionFile.delete({ where: { id: file.id } });
    await createAuditLog(auth.userId, "DELETE_SUBMISSION_FILE", "SubmissionFile", file.id, `حذف الملف ${file.name}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete submission file error:", error);
    if (error instanceof DropboxIntegrationError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "تعذر حذف الملف" }, { status: 500 });
  }
}
