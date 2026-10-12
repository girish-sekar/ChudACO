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