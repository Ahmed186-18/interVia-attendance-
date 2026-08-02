ALTER TABLE "SystemSettings" ADD COLUMN "workStartMinutes" INTEGER NOT NULL DEFAULT 480;
ALTER TABLE "SystemSettings" ADD COLUMN "lateGraceMinutes" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "SystemSettings" ADD COLUMN "earlyCheckInMinutes" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "SystemSettings" ADD COLUMN "autoCloseHour" INTEGER NOT NULL DEFAULT 22;

ALTER TABLE "Attendance" ADD COLUMN "expectedHours" REAL NOT NULL DEFAULT 8;
ALTER TABLE "Attendance" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PRESENT';
ALTER TABLE "Attendance" ADD COLUMN "lateMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Attendance" ADD COLUMN "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AttendanceAdjustment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "attendanceId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "reviewerId" TEXT,
  "requestedCheckIn" DATETIME,
  "requestedCheckOut" DATETIME,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewNote" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AttendanceAdjustment_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AttendanceAdjustment_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AttendanceAdjustment_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AttendanceAdjustment_status_createdAt_idx" ON "AttendanceAdjustment"("status", "createdAt");
CREATE INDEX "AttendanceAdjustment_requestedById_createdAt_idx" ON "AttendanceAdjustment"("requestedById", "createdAt");
