ALTER TABLE "AcoRetailerCard" ADD COLUMN "cardId" TEXT;

ALTER TABLE "AcoRetailerCard" ADD CONSTRAINT "AcoRetailerCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "AcoCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
