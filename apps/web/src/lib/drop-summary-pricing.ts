export type DropSummaryPricingRule = {
  category: string;
  priceRangeLabel: string;
};

function normalizeTerms(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ultra[-\s]+premium\s+collection/g, " upc ")
    .replace(/elite\s+trainer\s+box(?:es)?/g, " etb ")
    .replace(/\betbs?\b/g, " etb ")
    .replace(/booster\s+bundles?/g, " booster bundle ")
    .replace(/booster\s+box(?:es)?/g, " booster box ")
    .replace(/[^a-z0-9/]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => (term.length > 3 && term.endsWith("s") ? term.slice(0, -1) : term));
}

function matchesCategory(category: string, item: string, retailer: string): boolean {
  const categoryText = category
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const retailerText = retailer.toLowerCase();
  const isPokemonCenter = retailerText.includes("pokemon center") || retailerText.includes("pkc");

  if (categoryText.includes("target") && !retailerText.includes("target")) {
    return false;
  }
  if (categoryText.includes("pkc") && !isPokemonCenter) {
    return false;
  }
  if (categoryText.includes("regular") && isPokemonCenter) {
    return false;
  }

  const alternatives: string[][] = [];
  const matchableCategory = categoryText
    .replace(/\b([a-z0-9]+)\s*\/\s*([a-z0-9]+)\b/g, (_, first: string, second: string) => {
      alternatives.push([first, second]);
      return " ";
    })
    .replace(/\b([a-z0-9]+)\s+or\s+([a-z0-9]+)\b/g, (_, first: string, second: string) => {
      alternatives.push([first, second]);
      return " ";
    });
  const ignoredTerms = new Set(["1x", "target", "pkc", "regular", "styles", "may", "vary"]);
  const requiredTerms = normalizeTerms(matchableCategory).filter((term) => !ignoredTerms.has(term));
  const itemTerms = new Set(normalizeTerms(item));

  return (
    requiredTerms.every((term) => itemTerms.has(term)) &&
    alternatives.every((group) => group.some((term) => itemTerms.has(normalizeTerms(term)[0])))
  );
}

export function resolveDropSummaryPrice(
  item: string,
  retailer: string,
  rules: DropSummaryPricingRule[],
): number | null {
  const matchingPrices = rules
    .filter((rule) => matchesCategory(rule.category, item, retailer))
    .map((rule) => {
      const exactPrice = rule.priceRangeLabel.trim().match(/^\$\s*(\d+(?:\.\d{1,2})?)$/);
      return exactPrice ? Number(exactPrice[1]) : null;
    })
    .filter((price): price is number => price !== null && Number.isFinite(price));

  if (matchingPrices.length === 0 || matchingPrices.some((price) => price !== matchingPrices[0])) {
    return null;
  }

  return matchingPrices[0];
}

export function resolveDropSummaryOrderPrice(
  item: string,
  retailer: string,
  quantity: number,
  rules: DropSummaryPricingRule[],
): number | null {
  const unitPrice = resolveDropSummaryPrice(item, retailer, rules);
  return unitPrice === null ? null : unitPrice * quantity;
}