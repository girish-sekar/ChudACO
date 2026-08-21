import { encrypt, getImapEncryptionKeyFromEnv } from "@chudaco/db";

type EncryptedImapPassword = {
  encryptedPassword: string;
  encryptionIv: string;
};

export function encryptImapPassword(plaintext: string): EncryptedImapPassword {
  const key = getImapEncryptionKeyFromEnv();
  const encrypted = encrypt(plaintext, key);

  // Store authTag together with ciphertext to avoid a schema change.
  return {
    encryptedPassword: `${encrypted.ciphertext}:${encrypted.authTag}`,
    encryptionIv: encrypted.iv,
  };
}