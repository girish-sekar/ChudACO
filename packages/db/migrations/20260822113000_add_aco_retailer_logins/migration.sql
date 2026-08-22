-- CreateTable
CREATE TABLE "AcoRetailerLogin" (
    "id" TEXT NOT NULL,
    "acoAccountId" TEXT NOT NULL,
    "retailer" TEXT NOT NULL,
    "loginEmail" TEXT NOT NULL,
    "encryptedLoginPassword" TEXT NOT NULL,
    "loginPasswordIv" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcoRetailerLogin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcoRetailerLogin_acoAccountId_idx" ON "AcoRetailerLogin"("acoAccountId");

-- AddForeignKey
ALTER TABLE "AcoRetailerLogin"
ADD CONSTRAINT "AcoRetailerLogin_acoAccountId_fkey"
FOREIGN KEY ("acoAccountId") REFERENCES "AcoAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
