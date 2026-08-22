-- AlterTable
ALTER TABLE "AcoAccount"
ADD COLUMN "billingSameAsShipping" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "billingName" TEXT,
ADD COLUMN "billingPhone" TEXT,
ADD COLUMN "billingAddr" TEXT,
ADD COLUMN "billingCity" TEXT,
ADD COLUMN "billingState" TEXT,
ADD COLUMN "billingZip" TEXT;
