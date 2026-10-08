-- CreateTable
CREATE TABLE "AcoRetailerProfile" (
    "id" TEXT NOT NULL,
    "acoAccountId" TEXT NOT NULL,
    "retailer" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcoRetailerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcoRetailerProfile_acoAccountId_retailer_key" ON "AcoRetailerProfile"("acoAccountId", "retailer");
CREATE INDEX "AcoRetailerProfile_profileId_idx" ON "AcoRetailerProfile"("profileId");

-- AddForeignKey
ALTER TABLE "AcoRetailerProfile" ADD CONSTRAINT "AcoRetailerProfile_acoAccountId_fkey" FOREIGN KEY ("acoAccountId") REFERENCES "AcoAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcoRetailerProfile" ADD CONSTRAINT "AcoRetailerProfile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AcoProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
