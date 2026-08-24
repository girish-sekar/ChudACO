-- DropIndex
DROP INDEX "AcoAccount_userId_accountNumber_key";

-- AlterTable
ALTER TABLE "AcoAccount" ALTER COLUMN "accountNumber" DROP NOT NULL,
ALTER COLUMN "botProfileName" DROP NOT NULL;
