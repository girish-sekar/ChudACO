function normalizeSite(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function resolveCheckoutRetailer(site: string, accountRetailer: string): string {
  const normalizedSite = normalizeSite(site);

  if (normalizedSite.includes("target")) return "Target";
  if (normalizedSite.includes("pokemoncenter") || normalizedSite === "pkc") return "Pokemon Center";
  if (normalizedSite.includes("samsclub")) return "Sam's Club";
  if (normalizedSite.includes("costco")) return "Costco";
  if (normalizedSite.includes("bandai")) return "Bandai";
  if (normalizedSite.includes("valor")) return "Valor";

  return accountRetailer;
}