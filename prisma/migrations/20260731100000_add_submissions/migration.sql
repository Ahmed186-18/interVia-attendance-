-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "periodDate" DATETIME NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dropboxRequestId" TEXT NOT NULL,
    "dropboxRequestUrl" TEXT NOT NULL,
    "dropboxFolder" TEXT NOT NULL,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" DATETIME,
    "reviewerId" TEXT,
    "reviewedAt" DATETIME,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Submission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Submission_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubmissionFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "dropboxId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" REAL NOT NULL,
    "contentHash" TEXT,
    "uploadedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubmissionFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Submission_dropboxRequestId_key" ON "Submission"("dropboxRequestId");
CREATE UNIQUE INDEX "Submission_userId_projectId_type_periodDate_key" ON "Submission"("userId", "projectId", "type", "periodDate");
CREATE INDEX "Submission_projectId_periodDate_status_idx" ON "Submission"("projectId", "periodDate", "status");
CREATE INDEX "Submission_userId_periodDate_idx" ON "Submission"("userId", "periodDate");
CREATE UNIQUE INDEX "SubmissionFile_dropboxId_key" ON "SubmissionFile"("dropboxId");
CREATE INDEX "SubmissionFile_submissionId_idx" ON "SubmissionFile"("submissionId");
