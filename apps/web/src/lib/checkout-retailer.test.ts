import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveCheckoutRetailer } from "./checkout-retailer";

test("uses the webhook site when it identifies a known retailer", () => {
  assert.equal(resolveCheckoutRetailer("https://www.target.com", "Pokemon Center"), "Target");
  assert.equal(resolveCheckoutRetailer("Pokemon Center", "Target"), "Pokemon Center");
  assert.equal(resolveCheckoutRetailer("samsclub.com", "Costco"), "Sam's Club");
});

test("falls back to the account retailer for unknown sites", () => {
  assert.equal(resolveCheckoutRetailer("unknown-store.example", "Target"), "Target");
});