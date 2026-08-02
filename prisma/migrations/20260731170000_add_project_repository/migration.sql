ALTER TABLE "Project" ADD COLUMN "code" TEXT;
ALTER TABLE "Project" ADD COLUMN "clientName" TEXT;
ALTER TABLE "Project" ADD COLUMN "clientCode" TEXT;

CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

CREATE TABLE "ProjectRepositoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "sourceModifiedAt" DATETIME,
    "rawData" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "importedProjectId" TEXT,
    "importedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectRepositoryItem_importedProjectId_fkey"
      FOREIGN KEY ("importedProjectId") REFERENCES "Project" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProjectRepositoryItem_code_key" ON "ProjectRepositoryItem"("code");
CREATE UNIQUE INDEX "ProjectRepositoryItem_importedProjectId_key" ON "ProjectRepositoryItem"("importedProjectId");
CREATE INDEX "ProjectRepositoryItem_isAvailable_importedProjectId_idx" ON "ProjectRepositoryItem"("isAvailable", "importedProjectId");
CREATE INDEX "ProjectRepositoryItem_clientCode_idx" ON "ProjectRepositoryItem"("clientCode");
