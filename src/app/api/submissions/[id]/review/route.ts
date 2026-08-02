import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/auth";
import { createAuditLog, createNotification } from "@/lib/utils";
import { createDropboxFileRequest, DropboxIntegrationError } from "@/lib/dropbox";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireManager(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { action, note } = await request.json();
    if (!["REVIEWED", "REVISION_REQUESTED"].includes(action)) {
      return NextResponse.json({ error: "قرار المراجعة غير صحيح" }, { status: 400 });
    }
    const submission = await prisma.submission.findUnique({
      where: { id: params.id },
      include: { user: { select: { id: true, name: true } }, project: { select: { name: true } }, files: true },
    });
    if (!submission) return NextResponse.json({ error: "التسليم غير موجود" }, { status: 404 });
    if (submission.status !== "SUBMITTED") {
      return NextResponse.json({ error: "يمكن مراجعة التسليمات المكتملة فقط" }, { status: 409 });
    }

    let requestData: { id: string; url: string } | null = null;
    if (action === "REVISION_REQUESTED") {
      requestData = await createDropboxFileRequest({
        title: `إعادة تسليم - ${submission.user.name} - ${submission.project.name}`,
        destination: submission.dropboxFolder,
        description: typeof note === "string" ? note.trim().slice(0, 500) : "",
      });
      await prisma.submissionRevision.create({
        data: {
          submissionId: submission.id,
          version: submission.version,
          status: submission.status,
          filesJson: JSON.stringify(submission.files),
          note: submission.reviewNote,
          createdById: auth.userId,
        },
      });
    }
    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: {
        status: action,
        reviewerId: auth.userId,
        reviewedAt: new Date(),
        reviewNote: typeof note === "string" ? note.trim().slice(0, 1000) || null : null,
        ...(requestData ? { dropboxRequestId: requestData.id, dropboxRequestUrl: requestData.url } : {}),
        ...(action === "REVISION_REQUESTED" ? { version: { increment: 1 }, reopenedAt: new Date() } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
        files: { orderBy: { name: "asc" } },
      },
    });
    await createAuditLog(auth.userId, action, "Submission", submission.id, note?.trim() || undefined);
    await createNotification({
      userId: submission.userId,
      audience: "USER",
      type: action === "REVIEWED" ? "SUBMISSION_REVIEWED" : "SUBMISSION_REVISION_REQUESTED",
      title: action === "REVIEWED" ? "تمت مراجعة تسليمك" : "مطلوب تعديل التسليم",
      message: `${submission.project.name}${note?.trim() ? ` · ${note.trim()}` : ""}`,
      severity: action === "REVIEWED" ? "SUCCESS" : "WARNING",
      entityType: "Submission",
      entityId: submission.id,
      actionUrl: `/submissions?id=${submission.id}`,
    });
    return NextResponse.json({ submission: updated });
  } catch (error) {
    console.error("Review submission error:", error);
    if (error instanceof DropboxIntegrationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "تعذر مراجعة التسليم" }, { status: 500 });
  }
}
