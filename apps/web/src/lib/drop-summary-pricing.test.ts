import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDropSummaryOrderPrice, resolveDropSummaryPrice } from "./drop-summary-pricing";

const rules = [
  { category: "1x Delta Reign Booster bundle", priceRangeLabel: "$31.99" },
  { category: "1x 30th ETB", priceRangeLabel: "$69.99" },
  { category: "1x Delta Reign PKC ETBs", priceRangeLabel: "$59.99" },
  { category: "1x Delta Reign regular ETB", priceRangeLabel: "$59.99" },
  { category: "1x Mew/Mewtwo 30th Collection", priceRangeLabel: "$39.99" },
  { category: "1x 30th UPC (Day/Night) Target", priceRangeLabel: "$249.99" },
  { category: "1x 30th UPC (Day/Night) PKC", priceRangeLabel: "$179.99" },
  { category: "Elite Trainer Boxes", priceRangeLabel: "$40-$70" },
];

test("resolves exact product labels despite item-name formatting differences", () => {
  assert.equal(
    resolveDropSummaryPrice("Pokémon TCG: Mega Evolution—Delta Reign Booster Bundle", "Costco", rules),
    31.99,
  );
  assert.equal(
    resolveDropSummaryPrice("Pokémon TCG: 30th Celebration Elite Trainer Box", "Target", rules),
    69.99,
  );
  assert.equal(
    resolveDropSummaryPrice("Pokémon TCG: 30th Celebration Figure Collection- Mewtwo", "Target", rules),
    39.99,
  );
});

test("prices 30th Celebration Booster Bundles at $31.99 each", () => {
  const item = "Pokémon TCG: 30th Celebration Booster Bundle";
  assert.equal(resolveDropSummaryPrice(item, "Target", rules), 31.99);
  assert.equal(resolveDropSummaryOrderPrice(item, "Target", 2, rules), 63.98);
  assert.equal(resolveDropSummaryOrderPrice(item, "Target", 2, rules, 59.98), 63.98);
});

test("prices Ascended Heroes Tech Sticker Collections at $19.99 each", () => {
  const item = "Pokémon TCG: Mega Evolution—Ascended Heroes Tech Sticker Collection";
  assert.equal(resolveDropSummaryPrice(item, "Target", rules), 19.99);
  assert.equal(resolveDropSummaryOrderPrice(item, "Target", 2, rules), 39.98);
});

test("applies retailer-specific prices only to the matching retailer", () => {
  const item = "Pokémon TCG: 30th Celebration Ultra-Premium Collection- Night";
  assert.equal(resolveDropSummaryPrice(item, "Target", rules), 249.99);
  assert.equal(resolveDropSummaryPrice(item, "Pokemon Center", rules), 179.99);
});

test("resolves the Delta Reign ETB at $59.99 for both retailer categories", () => {
  const item = "Pokémon TCG: Mega Evolution—Delta Reign Elite Trainer Box";
  assert.equal(resolveDropSummaryPrice(item, "Target", rules), 59.99);
  assert.equal(resolveDropSummaryPrice(item, "Pokemon Center", rules), 59.99);
});

test("keeps ranged labels, ambiguous matches, and unmatched products unpriced", () => {
  assert.equal(resolveDropSummaryPrice("Elite Trainer Boxes", "Target", rules), null);
  assert.equal(resolveDropSummaryPrice("Unknown product", "Target", rules), null);
  assert.equal(
    resolveDropSummaryPrice("Pokémon TCG: Mega Evolution— Delta Reign Elite Trainer Box", "Target", rules),
    59.99,
  );
});

test("a backfilled unit price scales to the checkout quantity", () => {
  const unitPrice = resolveDropSummaryPrice(
    "Pokémon TCG: 30th Celebration Elite Trainer Box",
    "Target",
    rules,
  );
  assert.equal(unitPrice, 69.99);
  assert.equal(resolveDropSummaryOrderPrice(
    "Pokémon TCG: 30th Celebration Elite Trainer Box",
    "Target",
    2,
    rules,
  ), 139.98);
  assert.equal(resolveDropSummaryOrderPrice(
    "Pokémon TCG: Mega Evolution—Delta Reign Elite Trainer Box",
    "Pokemon Center",
    2,
    rules,
  ), 119.98);
});

test("Porsche 930 checkouts use $38 per car without doubling reported order totals", () => {
  const item = "Hot Wheels RLC Exclusive RWB Porsche 930";
  for (const retailer of ["Mattel", "Costco", "Pokemon Center", ""]) {
    assert.equal(resolveDropSummaryOrderPrice(item, retailer, 2, [], 38), 76);
    assert.equal(resolveDropSummaryOrderPrice(item, retailer, 2, [], 76), 76);
    assert.equal(resolveDropSummaryOrderPrice(item, retailer, 2, [], null), 76);
    assert.equal(resolveDropSummaryOrderPrice(item, retailer, 1, [], 38), 38);
  }
});

test("other products keep their reported order totals", () => {
  assert.equal(resolveDropSummaryOrderPrice("Other car", "Mattel", 2, rules, 38), 38);
  assert.equal(resolveDropSummaryOrderPrice("30th Celebration Elite Trainer Box", "Target", 2, rules, 139.98), 139.98);
  assert.equal(resolveDropSummaryOrderPrice("Unknown item", "Target", 2, [], null), null);
});