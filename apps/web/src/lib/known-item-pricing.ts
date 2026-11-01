export function ascendedHeroesTechStickerUnitPrice(item: string): number | null {
  return /\bascended\s+heroes\b.*\btech\s+sticker\s+collection\b/i.test(item) ? 19.99 : null;
}