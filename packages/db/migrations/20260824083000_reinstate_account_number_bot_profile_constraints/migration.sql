-- Re-enforce strict ACO account identifiers after interim nullable migration
ALTER TABLE "AcoAccount"
ALTER COLUMN "accountNumber" SET NOT NULL,
ALTER COLUMN "botProfileName" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "AcoAccount_userId_accountNumber_key" ON "AcoAccount"("userId", "accountNumber");
