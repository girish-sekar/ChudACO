import { decrypt, getImapEncryptionKeyFromEnv } from "@chudaco/db";
import { ImapFlow } from "imapflow";

type ImapCredentials = {
  email: string | null;
  imapHost: string | null;
  imapPort: number;
  imapSecurity: string;
  encryptedPassword: string | null;
  encryptionIv: string | null;
};

function normalizeSecureMode(security: string): boolean {
  const normalized = security.trim().toLowerCase();
  return normalized === "ssl/tls" || normalized === "ssl" || normalized === "tls";
}

function sanitizeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Connection failed";
  }

  const message = error.message.trim();
  if (!message) {
    return "Connection failed";
  }

  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}

export function hasImapCredentials(config: ImapCredentials): boolean {
  return Boolean(config.email && config.imapHost && config.encryptedPassword && config.encryptionIv);
}

export async function testImapCredentials(config: ImapCredentials): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const [ciphertext, authTag] = (config.encryptedPassword ?? "").split(":");
    if (!ciphertext || !authTag || !config.encryptionIv || !config.email || !config.imapHost) {
      throw new Error("Invalid stored credential payload");
    }

    const password = decrypt(ciphertext, config.encryptionIv, authTag, getImapEncryptionKeyFromEnv());
    const client = new ImapFlow({
      host: config.imapHost,
      port: config.imapPort,
      secure: normalizeSecureMode(config.imapSecurity),
      auth: { user: config.email, pass: password },
      logger: false,
    });

    await client.connect();
    await client.logout();
    return { success: true };
  } catch (error) {
    return { success: false, error: sanitizeErrorMessage(error) };
  }
}
