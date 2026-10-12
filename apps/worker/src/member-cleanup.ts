import { prisma } from "@chudaco/db";
import { deleteMemberSheetData } from "./sheets-cleanup";

const DEFAULT_POLL_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_GRACE_DAYS = 7;
const CLEANUP_LEASE_MS = 30 * 60 * 1000;
const DISCORD_REQUEST_TIMEOUT_MS = 10 * 1000;
const MAX_DISCORD_RATE_LIMIT_RETRIES = 5;

type DiscordAccessCheck = "allowed" | "revoked" | "unknown";

export function classifyMemberAccessResponse(
  status: number,
  roles: string[] | undefined,
  requiredRoleId: string,
): DiscordAccessCheck {
  if (status === 404) return "revoked";
  if (status !== 200) return "unknown";
  return roles?.includes(requiredRoleId) ? "allowed" : "revoked";
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function configuredIds(name: string): Set<string> {
  return new Set(
    (process.env[name] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function discordConfig() {
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const requiredRoleId = process.env.DISCORD_REQUIRED_ROLE_ID?.trim();
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!guildId || !requiredRoleId || !token) {
    throw new Error("DISCORD_GUILD_ID, DISCORD_REQUIRED_ROLE_ID, and DISCORD_BOT_TOKEN are required");
  }
  return { guildId, requiredRoleId, token };
}

async function preflightDiscord(config: ReturnType<typeof discordConfig>): Promise<void> {
  const headers = { Authorization: `Bot ${config.token}` };
  const guildResponse = await fetch(`https://discord.com/api/v10/guilds/${config.guildId}`, {
    headers,
    signal: AbortSignal.timeout(DISCORD_REQUEST_TIMEOUT_MS),
  });
  if (!guildResponse.ok) {
    throw new Error(`Discord guild preflight failed with HTTP ${guildResponse.status}`);
  }

  const roleResponse = await fetch(`https://discord.com/api/v10/guilds/${config.guildId}/roles`, {
    headers,
    signal: AbortSignal.timeout(DISCORD_REQUEST_TIMEOUT_MS),
  });
  if (!roleResponse.ok) {
    throw new Error(`Discord role preflight failed with HTTP ${roleResponse.status}`);
  }
  const roles = (await roleResponse.json()) as Array<{ id?: string }>;
  if (!roles.some((role) => role.id === config.requiredRoleId)) {
    throw new Error("DISCORD_REQUIRED_ROLE_ID was not found in the configured guild");
  }
}

async function checkMemberAccess(
  discordId: string,
  config: ReturnType<typeof discordConfig>,
): Promise<DiscordAccessCheck> {
  try {
    for (let attempt = 0; attempt <= MAX_DISCORD_RATE_LIMIT_RETRIES; attempt += 1) {
      const response = await fetch(
        `https://discord.com/api/v10/guilds/${config.guildId}/members/${discordId}`,
        {
          headers: { Authorization: `Bot ${config.token}` },
          signal: AbortSignal.timeout(DISCORD_REQUEST_TIMEOUT_MS),
        },
      );

      if (response.status === 429) {
        if (attempt === MAX_DISCORD_RATE_LIMIT_RETRIES) {
          throw new Error("Discord rate limit persisted after retries; pausing membership checks");
        }
        const retryAfterSeconds = Number.parseFloat(response.headers.get("retry-after") ?? "");
        const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : 2000;
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs + 250));
        continue;
      }

      if (!response.ok) {
        console.warn(`[member-cleanup] Discord member check returned HTTP ${response.status}`);
        return classifyMemberAccessResponse(response.status, undefined, config.requiredRoleId);
      }

      const member = (await response.json()) as { roles?: string[] };
      return classifyMemberAccessResponse(response.status, member.roles, config.requiredRoleId);
    }
    return "unknown";
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Discord rate limit persisted")) throw error;
    console.warn("[member-cleanup] Discord member check failed; leaving access state unchanged");
    return "unknown";
  }
}

async function reconcileAccess(config: ReturnType<typeof discordConfig>): Promise<void> {
  const users = await prisma.user.findMany({
    where: { discordAccessStatus: { in: ["active", "grace"] } },
    select: { id: true, discordId: true, discordAccessStatus: true },
    orderBy: { createdAt: "asc" },
  });
  const adminIds = configuredIds("ADMIN_DISCORD_IDS");
  const graceDays = positiveIntegerEnv("MEMBER_CLEANUP_GRACE_DAYS", DEFAULT_GRACE_DAYS);

  for (const user of users) {
    if (adminIds.has(user.discordId)) continue;

    const access = await checkMemberAccess(user.discordId, config);
    const checkedAt = new Date();
    if (access === "unknown") continue;

    if (access === "allowed" && user.discordAccessStatus === "grace") {
      await prisma.user.updateMany({
        where: { id: user.id, discordAccessStatus: "grace" },
        data: {
          discordAccessStatus: "active",
          discordAccessRevokedAt: null,
          discordCleanupAfter: null,
          discordCleanupLastError: null,
        },
      });
      continue;
    }

    if (access === "revoked" && user.discordAccessStatus === "active") {
      const cleanupAfter = new Date(checkedAt.getTime() + graceDays * 24 * 60 * 60 * 1000);
      const result = await prisma.user.updateMany({
        where: { id: user.id, discordAccessStatus: "active" },
        data: {
          discordAccessStatus: "grace",
          discordAccessRevokedAt: checkedAt,
          discordCleanupAfter: cleanupAfter,
        },
      });
      if (result.count > 0) {
        console.log(`[member-cleanup] Access revoked; cleanup scheduled after grace period for user ${user.id}`);
      }
    }
  }
}

async function claimCleanup(userId: string, now: Date): Promise<boolean> {
  const staleLeaseBefore = new Date(now.getTime() - CLEANUP_LEASE_MS);
  const result = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [
        { discordAccessStatus: "grace", discordCleanupAfter: { lte: now } },
        { discordAccessStatus: "cleanup_failed" },
        { discordAccessStatus: "cleaning", discordCleanupStartedAt: { lte: staleLeaseBefore } },
      ],
    },
    data: {
      discordAccessStatus: "cleaning",
      discordCleanupStartedAt: now,
      discordCleanupAttempts: { increment: 1 },
      discordCleanupLastError: null,
    },
  });
  return result.count === 1;
}

async function removeMemberDatabaseData(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, discordAccessStatus: true },
    });
    if (!user || user.discordAccessStatus !== "cleaning") {
      throw new Error("Member cleanup claim was lost before database pruning");
    }

    const accountIds = (await tx.acoAccount.findMany({
      where: { userId },
      select: { id: true },
    })).map((account) => account.id);

    if (accountIds.length > 0) {
      await tx.acoRetailerLogin.deleteMany({ where: { acoAccountId: { in: accountIds } } });
      await tx.acoRetailerCard.deleteMany({ where: { acoAccountId: { in: accountIds } } });
      await tx.acoRetailerProfile.deleteMany({ where: { acoAccountId: { in: accountIds } } });
      await tx.cardOnFile.deleteMany({ where: { acoAccountId: { in: accountIds } } });
      await tx.acoAccount.deleteMany({ where: { id: { in: accountIds } } });
    }

    await tx.acoProfile.deleteMany({ where: { userId } });
    await tx.acoImapConfig.deleteMany({ where: { userId } });
    await tx.acoCard.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        username: `former-member-${userId.slice(-8)}`,
        avatarUrl: null,
        notifyOnSuccess: false,
        notifyOnFailure: false,
        notifyWeeklySummary: false,
        discordAccessStatus: "cleaned",
        discordCleanupAfter: null,
        discordCleanupStartedAt: null,
        discordCleanupLastError: null,
        discordCleanupCompletedAt: new Date(),
      },
    });
  });
}

async function processCleanupQueue(): Promise<void> {
  const now = new Date();
  const staleLeaseBefore = new Date(now.getTime() - CLEANUP_LEASE_MS);
  const candidates = await prisma.user.findMany({
    where: {
      OR: [
        { discordAccessStatus: "grace", discordCleanupAfter: { lte: now } },
        { discordAccessStatus: "cleanup_failed" },
        { discordAccessStatus: "cleaning", discordCleanupStartedAt: { lte: staleLeaseBefore } },
      ],
    },
    select: { id: true, discordId: true, discordAccessStatus: true },
    orderBy: { discordCleanupAfter: "asc" },
  });
  const adminIds = configuredIds("ADMIN_DISCORD_IDS");

  for (const candidate of candidates) {
    if (adminIds.has(candidate.discordId) && candidate.discordAccessStatus === "grace") {
      await prisma.user.updateMany({
        where: { id: candidate.id, discordAccessStatus: "grace" },
        data: {
          discordAccessStatus: "active",
          discordAccessRevokedAt: null,
          discordCleanupAfter: null,
          discordCleanupLastError: null,
        },
      });
      continue;
    }
    if (!(await claimCleanup(candidate.id, now))) continue;

    try {
      const [accounts, cards] = await Promise.all([
        prisma.acoAccount.findMany({ where: { userId: candidate.id }, select: { id: true } }),
        prisma.acoCard.findMany({ where: { userId: candidate.id }, select: { id: true } }),
      ]);
      await deleteMemberSheetData(
        accounts.map((account) => account.id),
        cards.map((card) => card.id),
      );
      await removeMemberDatabaseData(candidate.id);
      console.log(`[member-cleanup] Cleanup completed for user ${candidate.id}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown cleanup error";
      await prisma.user.updateMany({
        where: { id: candidate.id, discordAccessStatus: "cleaning" },
        data: {
          discordAccessStatus: "cleanup_failed",
          discordCleanupStartedAt: null,
          discordCleanupLastError: detail.slice(0, 1000),
        },
      });
      console.error(`[member-cleanup] Cleanup failed for user ${candidate.id}: ${detail}`);
    }
  }
}

let cycleInFlight = false;

async function runCycle(): Promise<void> {
  if (cycleInFlight) return;
  cycleInFlight = true;
  try {
    const config = discordConfig();
    await preflightDiscord(config);
    await reconcileAccess(config);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Discord reconciliation error";
    console.error(`[member-cleanup] Membership reconciliation skipped: ${detail}`);
  }

  try {
    await processCleanupQueue();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown cleanup queue error";
    console.error(`[member-cleanup] Cleanup queue processing failed: ${detail}`);
  } finally {
    cycleInFlight = false;
  }
}

export function startMemberCleanupWorker(): void {
  const intervalMs = positiveIntegerEnv("MEMBER_CLEANUP_INTERVAL_MINUTES", DEFAULT_POLL_INTERVAL_MS / 60_000) * 60_000;
  void runCycle();
  setInterval(() => void runCycle(), intervalMs);
}