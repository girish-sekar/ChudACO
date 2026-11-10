import { createHash } from "node:crypto";
import { prisma } from "@chudaco/db";
import { NextRequest, NextResponse } from "next/server";

export type IncludedAccountPull = {
  id: string;
  retailer: string;
};

export function normalizePullRetailer(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  const key = name.toLowerCase();
  const names: Record<string, string> = {
    pkc: "Pokemon Center", "pokémon center": "Pokemon Center", pokemoncenter: "Pokemon Center",
    "pokemon center": "Pokemon Center", target: "Target", costco: "Costco", bandai: "Bandai",
    walmart: "Walmart", bestbuy: "Best Buy", "best buy": "Best Buy", gamestop: "GameStop",
    "sam's club": "Sam's Club", "sams club": "Sam's Club", "sam club": "Sam's Club", mattel: "Mattel",
  };
  return names[key] ?? key;
}

export async function finishPullExport(
  request: NextRequest,
  adminDiscordId: string,
  exportType: string,
  included: IncludedAccountPull[],
  response: NextResponse,
): Promise<NextResponse> {
  response.headers.set("Cache-Control", "no-store");
  if (request.method !== "POST") return response;
  const actionId = request.headers.get("X-Export-Action");
  const expectedParts = Number(request.headers.get("X-Export-Parts") ?? "1");
  if (!actionId || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(actionId) || ![1, 2].includes(expectedParts)) {
    return NextResponse.json({ error: "Invalid export action." }, { status: 400 });
  }
  const params = new URLSearchParams(request.nextUrl.searchParams);
  params.delete("mode");
  params.sort();
  const requestHash = createHash("sha256").update(`${request.nextUrl.pathname}?${params}|${expectedParts}`).digest("hex");
  const part = `${request.nextUrl.pathname}:${exportType}`;
  const pairs = Array.from(new Map(included.map((entry) => {
    const retailer = normalizePullRetailer(entry.retailer);
    return [`${entry.id}:${retailer}`, { id: entry.id, retailer }];
  })).values());
  const inclusionHash = createHash("sha256").update(JSON.stringify(
    pairs.map((entry) => [entry.id, entry.retailer]).sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second))),
  )).digest("hex");
  const recordedPart = `${part}:${inclusionHash}`;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await prisma.$transaction(async (tx) => {
          const batch = await tx.accountPullExport.upsert({
            where: { actionKey: `${adminDiscordId}:${actionId}` },
            create: { actionKey: `${adminDiscordId}:${actionId}`, adminDiscordId, requestHash, expectedParts },
            update: {},
          });
          if (batch.requestHash !== requestHash) throw new Error("ACTION_CONFLICT");
          const previousPart = batch.parts.find((value) => value.startsWith(`${part}:`));
          if (previousPart && previousPart !== recordedPart) throw new Error("ACTION_CONFLICT");
          if (previousPart) return;
          if (batch.completedAt) throw new Error("ACTION_CONFLICT");
          const accounts = await tx.acoAccount.findMany({
            where: { id: { in: pairs.map((entry) => entry.id) } },
            select: { id: true, userId: true, accountNumber: true },
          });
          const owners = new Map(accounts.map((account) => [account.id, account]));
          const pulls = pairs.flatMap((entry) => {
            const owner = owners.get(entry.id);
            return owner ? [{ exportId: batch.id, userId: owner.userId, acoAccountId: owner.id,
              accountKey: owner.id, accountNumber: owner.accountNumber, retailer: entry.retailer, exportType }] : [];
          });
          if (pulls.length) {
            await tx.accountPull.createMany({ data: pulls, skipDuplicates: true });
            await tx.accountPullNotification.createMany({
              data: Array.from(new Set(pulls.map((pull) => pull.userId))).map((userId) => ({ exportId: batch.id, userId })),
              skipDuplicates: true,
            });
          }
          const parts = [...batch.parts, recordedPart];
          await tx.accountPullExport.update({
            where: { id: batch.id },
            data: { parts, completedAt: parts.length >= batch.expectedParts ? new Date() : null },
          });
        }, { isolationLevel: "Serializable" });
        break;
      } catch (error) {
        if (["P2034", "P2002"].includes((error as { code?: string }).code ?? "") && attempt < 2) continue;
        throw error;
      }
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "ACTION_CONFLICT"
      ? "This export action was already used with different filters. Start a new export."
      : "Unable to record this account pull. Please retry the export." }, { status: 409 });
  }
  return response;
}