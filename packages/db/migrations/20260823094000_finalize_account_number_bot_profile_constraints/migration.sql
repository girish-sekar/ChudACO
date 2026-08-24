-- Enforce required fields after backfill
ALTER TABLE "AcoAccount"
ALTER COLUMN "accountNumber" SET NOT NULL,
ALTER COLUMN "botProfileName" SET NOT NULL;

-- Ensure each account number is unique within a user
CREATE UNIQUE INDEX "AcoAccount_userId_accountNumber_key" ON "AcoAccount"("userId", "accountNumber");
