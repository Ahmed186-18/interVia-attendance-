-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'LIGHT',
    "compactMode" BOOLEAN NOT NULL DEFAULT false,
    "reducedMotion" BOOLEAN NOT NULL DEFAULT false,
    "notifyTasks" BOOLEAN NOT NULL DEFAULT true,
    "notifyProjects" BOOLEAN NOT NULL DEFAULT true,
    "notifyRequests" BOOLEAN NOT NULL DEFAULT true,
    "notifyAttendance" BOOLEAN NOT NULL DEFAULT true,
    "notifySystem" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "organizationName" TEXT NOT NULL DEFAULT 'InterVia Design',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Hebron',
    "dailyWorkHours" REAL NOT NULL DEFAULT 8,
    "workingDays" TEXT NOT NULL DEFAULT '[0,1,2,3,4]',
    "hourlyCheckInterval" INTEGER NOT NULL DEFAULT 60,
    "hourlyCheckWindow" INTEGER NOT NULL DEFAULT 15,
    "overtimeMaxHours" REAL NOT NULL DEFAULT 12,
    "annualLeaveDays" INTEGER NOT NULL DEFAULT 21,
    "projectTrashRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
