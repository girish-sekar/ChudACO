/*
  Warnings:

  - A unique constraint covering the columns `[botProfileName]` on the table `AcoAccount` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "AcoAccount_botProfileName_key" ON "AcoAccount"("botProfileName");
