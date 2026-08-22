/*
  Warnings:

  - You are about to drop the column `shippingAddr` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `shippingCity` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `shippingName` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `shippingPhone` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `shippingState` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `shippingZip` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "shippingAddr",
DROP COLUMN "shippingCity",
DROP COLUMN "shippingName",
DROP COLUMN "shippingPhone",
DROP COLUMN "shippingState",
DROP COLUMN "shippingZip";
