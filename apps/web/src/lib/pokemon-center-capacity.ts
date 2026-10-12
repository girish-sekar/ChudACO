import { prisma } from "@chudaco/db";

type PrismaTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const DEFAULT_MAX_POKEMON_CENTER_PROFILES = 250;
const DEFAULT_EXTERNAL_POKEMON_CENTER_PROFILES = 50;

export function isPokemonCenterRetailer(retailer: string): boolean {
  const normalized = retailer
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  return normalized === "pokemoncenter" || normalized === "pkc";
}

function getConfiguredCount(name: string, fallback: number, allowZero = false): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    console.warn(`Invalid ${name} value, falling back to default`, { value: raw, fallback });
    return fallback;
  }

  return value;
}

export function getPokemonCenterCapacity() {
  const maxProfiles = getConfiguredCount("MAX_POKEMON_CENTER_PROFILES", DEFAULT_MAX_POKEMON_CENTER_PROFILES);
  const externalProfiles = getConfiguredCount(
    "EXTERNAL_POKEMON_CENTER_PROFILES",
    DEFAULT_EXTERNAL_POKEMON_CENTER_PROFILES,
    true,
  );

  return {
    maxProfiles,
    externalProfiles,
    managedProfileLimit: Math.max(0, maxProfiles - externalProfiles),
  };
}

export async function lockPokemonCenterCapacity(tx: PrismaTransaction): Promise<void> {
  await tx.$queryRaw<[{ locked: number }]>
    `WITH capacity_lock AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(1735289200, 1)
    )
    SELECT 1 AS locked FROM capacity_lock`;
}

export async function countPokemonCenterProfiles(
  tx: PrismaTransaction,
  excludingAccountId?: string,
): Promise<number> {
  const candidateRetailers = {
    OR: [
      { retailer: { contains: "pokemon", mode: "insensitive" as const } },
      { retailer: { contains: "pokémon", mode: "insensitive" as const } },
      { retailer: { equals: "PKC", mode: "insensitive" as const } },
    ],
  };

  const [retailerLogins, legacyAccounts] = await Promise.all([
    tx.acoRetailerLogin.findMany({
      where: {
        ...candidateRetailers,
        ...(excludingAccountId ? { acoAccountId: { not: excludingAccountId } } : {}),
      },
      select: { retailer: true },
    }),
    tx.acoAccount.findMany({
      where: {
        ...candidateRetailers,
        retailerLogins: { none: {} },
        ...(excludingAccountId ? { id: { not: excludingAccountId } } : {}),
      },
      select: { retailer: true },
    }),
  ]);

  return [...retailerLogins, ...legacyAccounts].filter((profile) =>
    isPokemonCenterRetailer(profile.retailer),
  ).length;
}