-- AlterTable
ALTER TABLE "AcoAccount" ADD COLUMN     "encryptedLoginPassword" TEXT,
ADD COLUMN     "loginEmail" TEXT,
ADD COLUMN     "loginPasswordIv" TEXT;
