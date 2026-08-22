-- AlterTable
ALTER TABLE "AcoAccount" ADD COLUMN     "shippingAddr" TEXT,
ADD COLUMN     "shippingCity" TEXT,
ADD COLUMN     "shippingName" TEXT,
ADD COLUMN     "shippingPhone" TEXT,
ADD COLUMN     "shippingState" TEXT,
ADD COLUMN     "shippingZip" TEXT;

-- AlterTable
ALTER TABLE "Checkout" ADD COLUMN     "acoAccountId" TEXT;

-- CreateTable
CREATE TABLE "CardOnFile" (
    "id" TEXT NOT NULL,
    "acoAccountId" TEXT NOT NULL,
    "cardBrand" TEXT,
    "last4" TEXT,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "cardholderName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardOnFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardOnFile_acoAccountId_key" ON "CardOnFile"("acoAccountId");

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_acoAccountId_fkey" FOREIGN KEY ("acoAccountId") REFERENCES "AcoAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardOnFile" ADD CONSTRAINT "CardOnFile_acoAccountId_fkey" FOREIGN KEY ("acoAccountId") REFERENCES "AcoAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
