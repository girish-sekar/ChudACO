-- AlterTable
ALTER TABLE "User"
ADD COLUMN "nextAcoAccountNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "PricingRule"
ADD COLUMN "minPrice" DECIMAL(10,2),
ADD COLUMN "maxPrice" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "AcoAccount"
ADD COLUMN "accountNumber" INTEGER,
ADD COLUMN "botProfileName" TEXT;

-- Unique index added after backfill through follow-up migration/script safety checks.
