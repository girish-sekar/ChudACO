import { PrismaClient } from "@prisma/client";
export { BillingStatus } from "@prisma/client";
export { FeeType } from "@prisma/client";
export { decrypt, encrypt, getImapEncryptionKeyFromEnv, parseBase64Key } from "./crypto";

type GlobalPrisma = typeof globalThis & {
  __chudaco_prisma__?: PrismaClient;
};

const globalForPrisma = globalThis as GlobalPrisma;

export const prisma = globalForPrisma.__chudaco_prisma__ ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__chudaco_prisma__ = prisma;
}