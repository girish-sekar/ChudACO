import { decrypt, getImapEncryptionKeyFromEnv, prisma } from "@chudaco/db";
import { ImapFlow } from "imapflow";

const POLL_INTERVAL_MS = 2 * 60 * 1000;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

function normalizeSecureMode(security: string): boolean {
  const normalized = security.trim().toLowerCase();
  return normalized === "ssl/tls" || normalized === "ssl" || normalized === "tls";
}

function splitEncryptedPassword(value: string): { ciphertext: string; authTag: string } {
  const [ciphertext, authTag] = value.split(":");
  if (!ciphertext || !authTag) {
    throw new Error("Invalid encrypted password payload");
  }

  return { ciphertext, authTag };
}

async function syncAccount(account: {
  id: string;
  label: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: string;
  encryptedPassword: string;
  encryptionIv: string;
}): Promise<void> {
  const key = getImapEncryptionKeyFromEnv();
  const { ciphertext, authTag } = splitEncryptedPassword(account.encryptedPassword);
  const password = decrypt(ciphertext, account.encryptionIv, authTag, key);
  const secure = normalizeSecureMode(account.imapSecurity);

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure,
    auth: {
      user: account.email,
      pass: password,
    },
    logger: false,
  });

  try {
    await client.connect();

    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - LOOKBACK_MS);
      const unreadUids = await client.search({ seen: false, since });

      if (Array.isArray(unreadUids) && unreadUids.length > 0) {
        for await (const message of client.fetch(unreadUids, { envelope: true })) {
          const subject = message.envelope?.subject?.trim() || "(no subject)";
          console.log(`[imap] ${account.label}: ${subject}`);

          // TODO: plug retailer-specific parsing here (verification codes, shipping confirmations, etc.).
        }
      }
    } finally {
      lock.release();
    }

    await prisma.acoAccount.update({
      where: { id: account.id },
      data: { lastSyncAt: new Date() },
    });
  } finally {
    await client.logout().catch(() => {
      // Ignore logout errors.
    });
  }
}

let pollInFlight = false;

async function runPollCycle(): Promise<void> {
  if (pollInFlight) {
    console.log("[imap] previous poll still running; skipping this interval");
    return;
  }

  pollInFlight = true;
  try {
    const accounts = await prisma.acoAccount.findMany({
      where: { status: "active" },
      select: {
        id: true,
        label: true,
        email: true,
        imapHost: true,
        imapPort: true,
        imapSecurity: true,
        encryptedPassword: true,
        encryptionIv: true,
      },
      orderBy: { label: "asc" },
    });

    for (const account of accounts) {
      try {
        await syncAccount(account);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[imap] sync failed for ${account.label}: ${message}`);
      }
    }
  } finally {
    pollInFlight = false;
  }
}

export function startImapWorker(): void {
  void runPollCycle();
  setInterval(() => {
    void runPollCycle();
  }, POLL_INTERVAL_MS);
}