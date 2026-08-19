import { PrismaClient } from "@prisma/client";

declare global {
  var __chudaco_prisma__: PrismaClient | undefined;
}

export const prisma = globalThis.__chudaco_prisma__ ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__chudaco_prisma__ = prisma;
}