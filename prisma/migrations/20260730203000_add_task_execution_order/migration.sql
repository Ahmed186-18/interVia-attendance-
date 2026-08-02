-- AlterTable
ALTER TABLE "Task" ADD COLUMN "executionOrder" INTEGER NOT NULL DEFAULT 0;

-- Initialize a stable ordering for existing tasks.
UPDATE "Task"
SET "executionOrder" = rowid;

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_executionOrder_idx" ON "Task"("assigneeId", "status", "executionOrder");
