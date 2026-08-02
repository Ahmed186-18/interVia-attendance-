CREATE TABLE "IntegrationCredential" (
    "provider" TEXT NOT NULL PRIMARY KEY,
    "encryptedValue" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
