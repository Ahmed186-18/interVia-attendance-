import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { closeDropboxFileRequest, createDropboxFileRequest, DropboxIntegrationError } from "@/lib/dropbox";
import { createAuditLog, createNotification } from "@/lib/utils";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { action, note } = await request.json();
    if (action === "CANCEL") {
      const submission = await prisma.submission.findUnique({ where: { id: params.id } });
      if (!submission) return NextResponse.json({ error: "التسليم غير موجود" }, { status: 404 });
      if (auth.role === "EMPLOYEE" && submission.userId !== auth.userId) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
      if (!["OPEN", "REVISION_REQUESTED"].includes(submission.status)) return NextResponse.json({ error: "لا يمكن إلغاء التسليم بعد اعتماده" }, { status: 409 });
      await closeDropboxFileRequest(submission.dropboxRequestId);
      const updated = await prisma.submission.update({ where: { id: submission.id }, data: { status: "CANCELLED", cancelledAt: new Date(), reviewNote: typeof note === "string" ? note.trim() || null : null } });
      await createAuditLog(auth.userId, "CANCEL_SUBMISSION", "Submission", submission.id, "إلغاء رابط التسليم");
      return NextResponse.json({ submission: updated });
    }

    if (action !== "REOPEN") return NextResponse.json({ error: "الإجراء غير صحيح" }, { status: 400 });
    const manager = requireManager(request);
    if (manager instanceof NextResponse) return manager;
    const submission = await prisma.submission.findUnique({ where: { id: params.id }, include: { user: { select: { name: true } }, project: { select: { name: true } }, files: true } });
    if (!submission) return NextResponse.json({ error: "التسليم غير موجود" }, { status: 404 });
    if (!["REVIEWED", "CANCELLED"].includes(submission.status)) return NextResponse.json({ error: "يمكن إعادة فتح التسليم بعد الاعتماد أو الإلغاء فقط" }, { status: 409 });
    const requestData = await createDropboxFileRequest({ title: `إضافة ملفات - ${submission.user.name} - ${submission.project.name}`, destination: submission.dropboxFolder, description: typeof note === "string" ? note.trim().slice(0, 500) : "" });
    const nextVersion = submission.version + 1;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.submissionRevision.create({ data: { submissionId: submission.id, version: submission.version, status: submission.status, filesJson: JSON.stringify(submission.files), note: submission.reviewNote, createdById: manager.userId } });
      return tx.submission.update({ where: { id: submission.id }, data: { status: "REVISION_REQUESTED", version: nextVersion, reopenedAt: new Date(), dropboxRequestId: requestData.id, dropboxRequestUrl: requestData.url, reviewerId: null, reviewedAt: null, reviewNote: typeof note === "string" ? note.trim() || null : null }, include: { files: true } });
    });
    await createAuditLog(manager.userId, "REOPEN_SUBMISSION", "Submission", submission.id, note || "إعادة فتح التسليم");
    await createNotification({ userId: submission.userId, audience: "USER", type: "SUBMISSION_REOPENED", title: "تم إعادة فتح التسليم", message: note || "يمكنك الآن إضافة أو استبدال ملفات التسليم", severity: "WARNING", entityType: "Submission", entityId: submission.id, actionUrl: "/submissions?id=" + submission.id });
    return NextResponse.json({ submission: updated });
  } catch (error) {
    console.error("Manage submission error:", error);
    if (error instanceof DropboxIntegrationError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "تعذر تنفيذ العملية على التسليم" }, { status: 500 });
  }
}
