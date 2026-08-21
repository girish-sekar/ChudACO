import { createCipheriv, randomBytes } from "crypto";

type EncryptedImapPassword = {
  encryptedPassword: string;
  encryptionIv: string;
};

export function encryptImapPassword(plaintext: string): EncryptedImapPassword {
  const encodedKey = process.env.IMAP_ENCRYPTION_KEY;

  if (!encodedKey) {
    throw new Error("Missing IMAP_ENCRYPTION_KEY");
  }

  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new Error("IMAP_ENCRYPTION_KEY must decode to 32 bytes");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Placeholder format for now: base64(ciphertext):base64(authTag). A later prompt can harden this.
  return {
    encryptedPassword: `${encrypted.toString("base64")}:${authTag.toString("base64")}`,
    encryptionIv: iv.toString("base64"),
  };
}