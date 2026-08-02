-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "country" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Qatar',
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'LIGHT',
    "compactMode" BOOLEAN NOT NULL DEFAULT false,
    "reducedMotion" BOOLEAN NOT NULL DEFAULT false,
    "notifyTasks" BOOLEAN NOT NULL DEFAULT true,
    "notifyProjects" BOOLEAN NOT NULL DEFAULT true,
    "notifyRequests" BOOLEAN NOT NULL DEFAULT true,
    "notifyAttendance" BOOLEAN NOT NULL DEFAULT true,
    "notifySystem" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "organizationName" TEXT NOT NULL DEFAULT 'InterVia Design',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Hebron',
    "dailyWorkHours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "workStartMinutes" INTEGER NOT NULL DEFAULT 480,
    "lateGraceMinutes" INTEGER NOT NULL DEFAULT 15,
    "earlyCheckInMinutes" INTEGER NOT NULL DEFAULT 60,
    "autoCloseHour" INTEGER NOT NULL DEFAULT 22,
    "workingDays" TEXT NOT NULL DEFAULT '[0,1,2,3,4]',
    "hourlyCheckInterval" INTEGER NOT NULL DEFAULT 60,
    "hourlyCheckWindow" INTEGER NOT NULL DEFAULT 15,
    "overtimeMaxHours" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "annualLeaveDays" INTEGER NOT NULL DEFAULT 21,
    "projectTrashRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "provider" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("provider")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3),
    "totalHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedHours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceAdjustment" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reviewerId" TEXT,
    "requestedCheckIn" TIMESTAMP(3),
    "requestedCheckOut" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HourlyCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "isDeducted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HourlyCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "clientName" TEXT,
    "clientCode" TEXT,
    "description" TEXT,
    "deadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRepositoryItem" (
    "id" TEXT NOT NULL,
    "externalProjectId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT,
    "clientName" TEXT,
    "clientCode" TEXT,
    "projectType" TEXT,
    "projectCategory" TEXT,
    "location" TEXT,
    "country" TEXT,
    "projectStatus" TEXT,
    "priority" TEXT,
    "sourceRow" INTEGER NOT NULL,
    "sourceFileId" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "sourceModifiedAt" TIMESTAMP(3),
    "rawData" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "importedProjectId" TEXT,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRepositoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "periodDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dropboxRequestId" TEXT NOT NULL,
    "dropboxRequestUrl" TEXT NOT NULL,
    "dropboxFolder" TEXT NOT NULL,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "cancelledAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionRevision" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "filesJson" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionFile" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "dropboxId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "contentHash" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "executionOrder" INTEGER NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3),
    "projectId" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OvertimeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "managerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OvertimeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ANNUAL',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "managerNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subtask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "taskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subtask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "duration" DOUBLE PRECISION DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tasks" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'USER',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "entityType" TEXT,
    "entityId" TEXT,
    "actionUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_userId_date_key" ON "Attendance"("userId", "date");

-- CreateIndex
CREATE INDEX "AttendanceAdjustment_status_createdAt_idx" ON "AttendanceAdjustment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceAdjustment_requestedById_createdAt_idx" ON "AttendanceAdjustment"("requestedById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRepositoryItem_code_key" ON "ProjectRepositoryItem"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRepositoryItem_importedProjectId_key" ON "ProjectRepositoryItem"("importedProjectId");

-- CreateIndex
CREATE INDEX "ProjectRepositoryItem_isAvailable_importedProjectId_idx" ON "ProjectRepositoryItem"("isAvailable", "importedProjectId");

-- CreateIndex
CREATE INDEX "ProjectRepositoryItem_clientCode_idx" ON "ProjectRepositoryItem"("clientCode");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_dropboxRequestId_key" ON "Submission"("dropboxRequestId");

-- CreateIndex
CREATE INDEX "Submission_projectId_periodDate_status_idx" ON "Submission"("projectId", "periodDate", "status");

-- CreateIndex
CREATE INDEX "Submission_userId_periodDate_idx" ON "Submission"("userId", "periodDate");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_userId_projectId_type_periodDate_key" ON "Submission"("userId", "projectId", "type", "periodDate");

-- CreateIndex
CREATE INDEX "SubmissionRevision_submissionId_createdAt_idx" ON "SubmissionRevision"("submissionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionRevision_submissionId_version_key" ON "SubmissionRevision"("submissionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionFile_dropboxId_key" ON "SubmissionFile"("dropboxId");

-- CreateIndex
CREATE INDEX "SubmissionFile_submissionId_idx" ON "SubmissionFile"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_userId_projectId_key" ON "ProjectMember"("userId", "projectId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_priority_idx" ON "Task"("assigneeId", "priority");

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_executionOrder_idx" ON "Task"("assigneeId", "status", "executionOrder");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_startDate_endDate_idx" ON "LeaveRequest"("userId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "LeaveRequest"("status");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_audience_createdAt_idx" ON "Notification"("userId", "audience", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_entityType_entityId_idx" ON "Notification"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAdjustment" ADD CONSTRAINT "AttendanceAdjustment_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAdjustment" ADD CONSTRAINT "AttendanceAdjustment_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAdjustment" ADD CONSTRAINT "AttendanceAdjustment_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HourlyCheck" ADD CONSTRAINT "HourlyCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HourlyCheck" ADD CONSTRAINT "HourlyCheck_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRepositoryItem" ADD CONSTRAINT "ProjectRepositoryItem_importedProjectId_fkey" FOREIGN KEY ("importedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionRevision" ADD CONSTRAINT "SubmissionRevision_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionRevision" ADD CONSTRAINT "SubmissionRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeRequest" ADD CONSTRAINT "OvertimeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
