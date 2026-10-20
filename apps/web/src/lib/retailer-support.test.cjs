const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");
const { NextRequest, NextResponse } = require("next/server");

function loadModule(file, dependencies = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, file), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: (name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

test("Mattel is available in the fallback retailer list", () => {
  assert.ok(loadModule("dashboard.ts").DEFAULT_RETAILERS.includes("Mattel"));
});

test("Valor exports a Mattel profile using its login email without IMAP or a login password", async () => {
  let query;
  const account = {
    id: "mattel-account", botProfileName: "Mattel Profile", retailer: "Mattel",
    loginEmail: "legacy@example.test", email: null, imapHost: null,
    encryptedPassword: null, encryptionIv: null,
    encryptedLoginPassword: null, loginPasswordIv: null,
    onlyOneCheckout: true, billingSameAsShipping: true,
    retailerLogins: [{ retailer: "Mattel", loginEmail: "creations@example.test", enabled: true }],
    cardOnFile: { last4: "1111", cardBrand: "Visa", expMonth: 7, expYear: 2030 },
    retailerCards: [],
    retailerProfiles: [{ retailer: "Mattel", profile: {
      shippingName: "Mattel User", shippingPhone: "0123456789",
      shippingAddr: "123 Test St", shippingCity: "Boston", shippingState: "MA", shippingZip: "02108",
    } }],
  };
  const sheetRow = Array(29).fill("");
  Object.assign(sheetRow, {
    5: "4111111111111111", 6: "07", 7: "30", 8: "123",
    28: JSON.stringify({ acoAccountId: account.id, retailer: "Mattel" }),
  });
  const dependencies = {
    "@chudaco/db": { prisma: { acoAccount: { findMany: async (value) => {
      query = value;
      return [account];
    } } } },
    "next/server": { NextRequest, NextResponse },
    zod: require("zod"),
    googleapis: { google: {
      auth: { GoogleAuth: class {} },
      sheets: () => ({ spreadsheets: { values: { get: async () => ({ data: { values: [sheetRow] } }) } } }),
    } },
    "@/lib/api-auth": { getAuthenticatedContext: async () => ({ discordId: "admin" }), getAdminDiscordIds: () => new Set(["admin"]) },
    "@/lib/payment-info": { getGoogleSheetsConfig: () => ({ spreadsheetId: "sheet", sheetName: "cards", keyPath: "key" }) },
    "@/lib/export-email": loadModule("export-email.ts"),
    "@/lib/sheet-card": loadModule("sheet-card.ts"),
    "@/lib/aco-library": { withRetailerProfile: (loaded, retailer) => ({
      ...loaded, ...loaded.retailerProfiles.find((entry) => entry.retailer === retailer)?.profile,
    }) },
    "@/lib/admin-export": { accountIdFilter: () => ({}) },
  };
  const { GET } = loadModule("../app/api/admin/export/valor-json/route.ts", dependencies);
  const response = await GET(new NextRequest("http://localhost/api/admin/export/valor-json?retailers=Mattel"));
  assert.equal(response.status, 200);
  assert.equal(query.where.OR[0].retailer.equals, "Mattel");
  const profile = (await response.json())[account.id];
  assert.equal(profile.email, "creations@example.test");
  assert.equal(profile.shipping.firstName, "Mattel");
  assert.equal(profile.shipping.addressLine1, "123 Test St");
  assert.equal(profile.card.number, "4111111111111111");
  assert.equal(profile.oneCheckout, true);
  assert.equal("imapHost" in profile, false);
  assert.equal("password" in profile, false);

  account.retailerLogins[0].enabled = false;
  const disabledResponse = await GET(new NextRequest("http://localhost/api/admin/export/valor-json?retailers=Mattel"));
  assert.deepEqual(await disabledResponse.json(), {});
});