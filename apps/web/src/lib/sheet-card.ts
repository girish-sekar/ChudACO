export function parseSheetCardMetadata(raw: string): { acoAccountId?: string; retailer?: string | null } {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object") return {};
    return {
      acoAccountId: typeof value.acoAccountId === "string" ? value.acoAccountId : undefined,
      retailer: typeof value.retailer === "string" ? value.retailer : null,
    };
  } catch {
    return raw ? { acoAccountId: raw } : {};
  }
}

export function findSheetCardRow(
  rows: string[][],
  account: { id: string; botProfileName: string },
  card: { last4: string | null } | null,
  retailer: string | null,
): string[] | undefined {
  if (!card?.last4) return undefined;
  const scope = (retailer ?? "").trim().toLowerCase();
  const candidates = rows.filter((row) => {
    const metadata = parseSheetCardMetadata(row[28] ?? "");
    const matchesAccount = metadata.acoAccountId
      ? metadata.acoAccountId === account.id
      : (row[1] ?? "").trim().toLowerCase() === account.botProfileName.trim().toLowerCase();
    return matchesAccount && (row[5] ?? "").replace(/\D/g, "").slice(-4) === card.last4;
  });
  return candidates.find((row) =>
    (parseSheetCardMetadata(row[28] ?? "").retailer ?? "").trim().toLowerCase() === scope,
  ) ?? candidates.find((row) => !parseSheetCardMetadata(row[28] ?? "").retailer);
}