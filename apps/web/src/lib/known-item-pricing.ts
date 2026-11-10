const knownTargetProducts = [
  {
    id: "1012793604",
    name: "Pokémon Trading Card Game: Mega Evolution— Delta Reign Elite Trainer Box",
    unitPrice: 59.99,
  },
  {
    id: "1012850570",
    name: "Pokémon Trading Card Game: 30th Celebration Ultra-Premium Collection- Day",
    unitPrice: 249.99,
  },
  {
    id: "1012663804",
    name: "Pokémon Trading Card Game: 30th Celebration Ditto Premium Collection",
    unitPrice: 49.99,
  },
] as const;

export function normalizeKnownItemName(item: string): string {
  return knownTargetProducts.find((product) => item.includes(product.id))?.name ?? item;
}

export function knownTargetProductUnitPrice(item: string): number | null {
  return knownTargetProducts.find((product) => item.includes(product.id) || item === product.name)?.unitPrice ?? null;
}

export function ascendedHeroesTechStickerUnitPrice(item: string): number | null {
  return /\bascended\s+heroes\b.*\btech\s+sticker\s+collection\b/i.test(item) ? 19.99 : null;
}