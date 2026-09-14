-- CreateTable
CREATE TABLE IF NOT EXISTS "AcoRetailerCard" (
    "id" TEXT NOT NULL,
    "acoAccountId" TEXT NOT NULL,
    "retailer" TEXT NOT NULL,
    "cardBrand" TEXT,
    "last4" TEXT,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "cardholderName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcoRetailerCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AcoRetailerCard_acoAccountId_retailer_key"
ON "AcoRetailerCard"("acoAccountId", "retailer");

CREATE INDEX IF NOT EXISTS "AcoRetailerCard_acoAccountId_idx"
ON "AcoRetailerCard"("acoAccountId");

-- AddForeignKey
ALTER TABLE "AcoRetailerCard"
ADD CONSTRAINT "AcoRetailerCard_acoAccountId_fkey"
FOREIGN KEY ("acoAccountId") REFERENCES "AcoAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
