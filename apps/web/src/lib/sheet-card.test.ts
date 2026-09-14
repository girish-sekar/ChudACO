import assert from "node:assert/strict";
import { test } from "node:test";
import { findSheetCardRow } from "./sheet-card";

const account = { id: "account-1", botProfileName: "Test profile" };

function makeRow(retailer: string | null, last4: string, accountId = account.id) {
  const row = Array<string>(30).fill("");
  row[1] = account.botProfileName;
  row[5] = `000000000000${last4}`;
  row[28] = JSON.stringify({ acoAccountId: accountId, retailer });
  return row;
}

test("retailer card wins even when the default row is first", () => {
  const defaultRow = makeRow(null, "0001");
  const costcoRow = makeRow("Costco", "0002");
  assert.equal(findSheetCardRow([defaultRow, costcoRow], account, { last4: "0002" }, " costco "), costcoRow);
  assert.equal(findSheetCardRow([costcoRow, defaultRow], account, { last4: "0001" }, null), defaultRow);
});

test("missing retailer card cannot use a different default card", () => {
  assert.equal(findSheetCardRow([makeRow(null, "0001")], account, { last4: "0002" }, "Costco"), undefined);
  assert.equal(findSheetCardRow([makeRow(null, "0001")], account, null, null), undefined);
});

test("other accounts and other retailer scopes cannot supply card details", () => {
  const rows = [makeRow("Costco", "0002", "other-account"), makeRow("Pokemon Center", "0002")];
  assert.equal(findSheetCardRow(rows, account, { last4: "0002" }, "Costco"), undefined);
});

test("legacy unscoped rows are usable only when the stored card matches", () => {
  const legacyRow = makeRow(null, "0002");
  assert.equal(findSheetCardRow([legacyRow], account, { last4: "0002" }, "Costco"), legacyRow);
  legacyRow[28] = "";
  assert.equal(findSheetCardRow([legacyRow], account, { last4: "0002" }, "Costco"), legacyRow);
  legacyRow[1] = "Other profile";
  assert.equal(findSheetCardRow([legacyRow], account, { last4: "0002" }, "Costco"), undefined);
});