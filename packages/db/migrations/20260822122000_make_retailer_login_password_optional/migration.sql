-- AlterTable
ALTER TABLE "AcoRetailerLogin"
ALTER COLUMN "encryptedLoginPassword" DROP NOT NULL,
ALTER COLUMN "loginPasswordIv" DROP NOT NULL;
