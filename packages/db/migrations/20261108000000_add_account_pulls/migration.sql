ALTER TABLE "User" ADD COLUMN "notifyOnAccountPull" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "AccountPullExport" (
    "id" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "adminDiscordId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expectedParts" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "AccountPullExport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountPull" (
    "id" TEXT NOT NULL,
    "exportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acoAccountId" TEXT,
    "accountKey" TEXT NOT NULL,
    "accountNumber" INTEGER NOT NULL,
    "retailer" TEXT NOT NULL,
    "exportType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountPull_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountPullNotification" (
    "id" TEXT NOT NULL,
    "exportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    CONSTRAINT "AccountPullNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountPullExport_actionKey_key" ON "AccountPullExport"("actionKey");
CREATE INDEX "AccountPull_userId_createdAt_idx" ON "AccountPull"("userId", "createdAt");
CREATE UNIQUE INDEX "AccountPull_exportId_accountKey_retailer_exportType_key" ON "AccountPull"("exportId", "accountKey", "retailer", "exportType");
CREATE INDEX "AccountPullNotification_status_availableAt_idx" ON "AccountPullNotification"("status", "availableAt");
CREATE UNIQUE INDEX "AccountPullNotification_exportId_userId_key" ON "AccountPullNotification"("exportId", "userId");

ALTER TABLE "AccountPull" ADD CONSTRAINT "AccountPull_exportId_fkey" FOREIGN KEY ("exportId") REFERENCES "AccountPullExport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountPull" ADD CONSTRAINT "AccountPull_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountPull" ADD CONSTRAINT "AccountPull_acoAccountId_fkey" FOREIGN KEY ("acoAccountId") REFERENCES "AcoAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountPullNotification" ADD CONSTRAINT "AccountPullNotification_exportId_fkey" FOREIGN KEY ("exportId") REFERENCES "AccountPullExport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountPullNotification" ADD CONSTRAINT "AccountPullNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;