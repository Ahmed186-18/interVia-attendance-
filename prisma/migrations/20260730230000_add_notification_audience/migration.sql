-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'USER';

-- Administrative events must never remain in employee inboxes.
DELETE FROM "Notification"
WHERE "type" IN ('TASK_READY_FOR_REVIEW', 'LEAVE_REQUESTED', 'OVERTIME_REQUESTED')
  AND "userId" NOT IN (SELECT "id" FROM "User" WHERE "role" = 'ADMIN');

UPDATE "Notification"
SET "audience" = 'ADMIN'
WHERE "type" IN ('TASK_READY_FOR_REVIEW', 'LEAVE_REQUESTED', 'OVERTIME_REQUESTED');

-- CreateIndex
CREATE INDEX "Notification_userId_audience_createdAt_idx"
ON "Notification"("userId", "audience", "createdAt");
