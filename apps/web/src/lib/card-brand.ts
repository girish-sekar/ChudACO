export const CARD_BRAND_OPTIONS = ["Visa", "Mastercard", "Amex", "Discover", "DinersClub", "JCB"] as const;
export type CardBrand = (typeof CARD_BRAND_OPTIONS)[number];

export function normalizeCardBrand(value: string | null | undefined): CardBrand | null {
  const normalized = (value ?? "").trim().toLowerCase().replace(/[\s.-]/g, "");
  if (!normalized) return null;
  if (normalized.includes("visa")) return "Visa";
  if (normalized.includes("mastercard") || normalized === "mc") return "Mastercard";
  if (normalized.includes("amex") || normalized.includes("americanexpress")) return "Amex";
  if (normalized.includes("discover")) return "Discover";
  if (normalized.includes("diners")) return "DinersClub";
  if (normalized.includes("jcb")) return "JCB";
  return null;
}
