import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export type EncryptionPayload = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export function parseBase64Key(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new Error("IMAP_ENCRYPTION_KEY must decode to 32 bytes");
  }

  return key;
}

export function encrypt(plaintext: string, key: Buffer): EncryptionPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decrypt(ciphertext: string, iv: string, authTag: string, key: Buffer): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

export function getImapEncryptionKeyFromEnv(): Buffer {
  const encodedKey = process.env.IMAP_ENCRYPTION_KEY;
  if (!encodedKey) {
    throw new Error("Missing IMAP_ENCRYPTION_KEY");
  }

  return parseBase64Key(encodedKey);
}