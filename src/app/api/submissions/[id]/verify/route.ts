import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { createAuditLog, notifyAdmins } from "@/lib/utils";
import {
  closeDropboxFileRequest,
  DropboxIntegrationError,
  getDropboxFileRequest,
  listDropboxFiles,
} from "@/lib/dropbox";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    });
    if (!submission) return NextResponse.json({ error: "التسليم غير موجود" }, { status: 404 });
    if (auth.role === "EMPLOYEE" && submission.userId !== auth.userId) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    if (!["OPEN", "REVISION_REQUESTED"].includes(submission.status)) {
      return NextResponse.json({ error: "تم إتمام هذا التسليم مسبقاً" }, { status: 409 });
    }

    const requestInfo = await getDropboxFileRequest(submission.dropboxRequestId);
    if (requestInfo.file_count < 1) {
      return NextResponse.json({ error: "لم يتم العثور على ملفات مرفوعة بعد. أكمل الرفع في Dropbox ثم حاول مجدداً." }, { status: 400 });
    }
    const files = await listDropboxFiles(submission.dropboxFolder);
    if (!files.length) return NextResponse.json({ error: "Dropbox أبلغ عن ملفات لكن تعذر قراءتها حالياً، حاول بعد لحظات" }, { status: 409 });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.submissionFile.deleteMany({ where: { submissionId: submission.id } });
      await tx.submissionFile.createMany({
        data: files.map((file) => ({
          submissionId: submission.id,
          dropboxId: file.id,
          name: file.name,
          path: file.path_lower,
          size: file.size,
          contentHash: file.content_hash || null,
          uploadedAt: file.client_modified ? new Date(file.client_modified) : null,
        })),
      });
      return tx.submission.update({
        where: { id: submission.id },
        data: {
          status: "SUBMITTED",
          fileCount: files.length,
          submittedAt: new Date(),
          reviewNote: null,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true } },
          files: { orderBy: { name: "asc" } },
        },
      });
    });
    await closeDropboxFileRequest(submission.dropboxRequestId).catch(() => null);
    await createAuditLog(auth.userId, "SUBMIT_FILES", "Submission", submission.id, `تسليم ${files.length} ملفات`);
    await notifyAdmins({
      type: "SUBMISSION_RECEIVED",
      title: submission.type === "DAILY" ? "تسليم يومي جديد" : "تسليم شهري جديد",
      message: `${submission.user.name} سلّم ${files.length} ملفات لمشروع ${submission.project.name}`,
      severity: "SUCCESS",
      entityType: "Submission",
      entityId: submission.id,
      actionUrl: `/submissions?id=${submission.id}`,
    }, auth.userId);
    return NextResponse.json({ submission: updated });
  } catch (error) {
    console.error("Verify submission error:", error);
    if (error instanceof DropboxIntegrationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "تعذر التحقق من الملفات" }, { status: 500 });
  }
}
