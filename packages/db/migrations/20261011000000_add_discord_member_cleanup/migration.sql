CREATE TYPE "DiscordAccessStatus" AS ENUM ('active', 'grace', 'cleaning', 'cleanup_failed', 'cleaned');

ALTER TABLE "User"
ADD COLUMN "discordAccessStatus" "DiscordAccessStatus" NOT NULL DEFAULT 'active',
ADD COLUMN "discordAccessRevokedAt" TIMESTAMP(3),
ADD COLUMN "discordCleanupAfter" TIMESTAMP(3),
ADD COLUMN "discordCleanupStartedAt" TIMESTAMP(3),
ADD COLUMN "discordCleanupAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "discordCleanupLastError" TEXT,
ADD COLUMN "discordCleanupCompletedAt" TIMESTAMP(3);

CREATE INDEX "User_discordAccessStatus_discordCleanupAfter_idx"
ON "User"("discordAccessStatus", "discordCleanupAfter");