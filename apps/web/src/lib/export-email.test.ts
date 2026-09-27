import test from "node:test";
import assert from "node:assert/strict";

import { resolveExportEmail } from "./export-email";

test("uses the selected retailer login email when exporting the profile email", () => {
  const account = {
    email: "imap@example.com",
    loginEmail: "default-login@example.com",
    retailerLogins: [
      { retailer: "Target", loginEmail: "target-login@example.com" },
      { retailer: "Pokemon Center", loginEmail: "pkc-login@example.com" },
    ],
  };

  assert.equal(resolveExportEmail(account, "Target"), "target-login@example.com");
  assert.equal(resolveExportEmail(account, "Pokemon Center"), "pkc-login@example.com");
});

test("falls back to the main account email when no retailer login matches", () => {
  const account = {
    email: "imap@example.com",
    loginEmail: "default-login@example.com",
    retailerLogins: [{ retailer: "Other Retailer", loginEmail: "other@example.com" }],
  };

  assert.equal(resolveExportEmail(account, "Target"), "default-login@example.com");
});
