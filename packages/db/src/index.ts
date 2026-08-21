import { PrismaClient } from "@prisma/client";
export { BillingStatus } from "@prisma/client";

type GlobalPrisma = typeof globalThis & {
  __chudaco_prisma__?: PrismaClient;
};

const globalForPrisma = globalThis as GlobalPrisma;

export const prisma = globalForPrisma.__chudaco_prisma__ ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__chudaco_prisma__ = prisma;
}