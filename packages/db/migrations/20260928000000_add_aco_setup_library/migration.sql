-- CreateTable
CREATE TABLE "AcoProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shippingName" TEXT,
    "shippingPhone" TEXT,
    "shippingAddr" TEXT,
    "shippingCity" TEXT,
    "shippingState" TEXT,
    "shippingZip" TEXT,
    "billingSameAsShipping" BOOLEAN NOT NULL DEFAULT true,
    "billingName" TEXT,
    "billingPhone" TEXT,
    "billingAddr" TEXT,
    "billingCity" TEXT,
    "billingState" TEXT,
    "billingZip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcoProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcoImapConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailProvider" TEXT,
    "imapHost" TEXT NOT NULL,
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "imapSecurity" TEXT NOT NULL DEFAULT 'SSL/TLS',
    "encryptedPassword" TEXT,
    "encryptionIv" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcoImapConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcoCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "cardholderName" TEXT NOT NULL,
    "cardBrand" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "expMonth" INTEGER NOT NULL,
    "expYear" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcoCard_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "AcoAccount"
    ADD COLUMN "profileId" TEXT,
    ADD COLUMN "imapConfigId" TEXT,
    ADD COLUMN "cardId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AcoProfile_userId_name_key" ON "AcoProfile"("userId", "name");
CREATE UNIQUE INDEX "AcoImapConfig_userId_email_key" ON "AcoImapConfig"("userId", "email");
CREATE UNIQUE INDEX "AcoCard_userId_label_key" ON "AcoCard"("userId", "label");

-- AddForeignKey
ALTER TABLE "AcoProfile" ADD CONSTRAINT "AcoProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcoImapConfig" ADD CONSTRAINT "AcoImapConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcoCard" ADD CONSTRAINT "AcoCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcoAccount" ADD CONSTRAINT "AcoAccount_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AcoProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcoAccount" ADD CONSTRAINT "AcoAccount_imapConfigId_fkey" FOREIGN KEY ("imapConfigId") REFERENCES "AcoImapConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcoAccount" ADD CONSTRAINT "AcoAccount_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "AcoCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every account with shipping details gets its own linked profile.
INSERT INTO "AcoProfile" (
    "id", "userId", "name",
    "shippingName", "shippingPhone", "shippingAddr", "shippingCity", "shippingState", "shippingZip",
    "billingSameAsShipping", "billingName", "billingPhone", "billingAddr", "billingCity", "billingState", "billingZip",
    "updatedAt"
)
SELECT
    'prof_' || a."id", a."userId", '#' || a."accountNumber" || ' ' || a."label",
    a."shippingName", a."shippingPhone", a."shippingAddr", a."shippingCity", a."shippingState", a."shippingZip",
    a."billingSameAsShipping", a."billingName", a."billingPhone", a."billingAddr", a."billingCity", a."billingState", a."billingZip",
    CURRENT_TIMESTAMP
FROM "AcoAccount" a
WHERE COALESCE(a."shippingName", a."shippingPhone", a."shippingAddr", a."shippingCity", a."shippingState", a."shippingZip") IS NOT NULL;

UPDATE "AcoAccount" a
SET "profileId" = p."id"
FROM "AcoProfile" p
WHERE p."id" = 'prof_' || a."id";

-- Backfill: one IMAP config per distinct inbox email, preferring an entry with a saved password.
INSERT INTO "AcoImapConfig" (
    "id", "userId", "email", "emailProvider", "imapHost", "imapPort", "imapSecurity",
    "encryptedPassword", "encryptionIv", "updatedAt"
)
SELECT DISTINCT ON (a."userId", LOWER(a."email"))
    'imap_' || a."id", a."userId", a."email", a."emailProvider", a."imapHost", a."imapPort", a."imapSecurity",
    a."encryptedPassword", a."encryptionIv", CURRENT_TIMESTAMP
FROM "AcoAccount" a
WHERE a."email" IS NOT NULL AND a."imapHost" IS NOT NULL
ORDER BY a."userId", LOWER(a."email"), (a."encryptedPassword" IS NULL), a."accountNumber";

UPDATE "AcoAccount" a
SET "imapConfigId" = c."id"
FROM "AcoImapConfig" c
WHERE c."userId" = a."userId"
  AND LOWER(c."email") = LOWER(a."email")
  AND a."imapHost" IS NOT NULL;
