const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");
const { NextRequest, NextResponse } = require("next/server");

function loadHelper(file) {
  const source = fs.readFileSync(path.resolve(__dirname, file), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports });
  return exports;
}

function setup() {
  const state = { auth: { discordId: "admin" }, query: null, decryptFails: false, sheetFails: false, sheetCalls: 0 };
  const login = (retailer, enabled = true) => ({
    retailer, enabled, loginEmail: `${retailer.toLowerCase()}@retailer.test`,
    encryptedLoginPassword: "retail-secret:tag", loginPasswordIv: "iv",
  });
  const account = {
    id: "account-1", botProfileName: 'testuser - "Primary", card',
    shippingName: "Test User", shippingPhone: "0123456789",
    shippingAddr: "123 Test St\nUnit 2", shippingCity: "Boston", shippingState: "MA", shippingZip: "02108",
    billingSameAsShipping: true, billingName: "Other Name", billingAddr: "Other Street",
    billingCity: "Other City", billingState: "CA", billingZip: "90210",
    cardOnFile: { last4: "1111", expMonth: 7, expYear: 2030 }, retailerCards: [], retailerProfiles: [],
    retailer: "Target", loginEmail: "legacy@retailer.test",
    encryptedLoginPassword: "legacy-secret:tag", loginPasswordIv: "iv",
    email: "mailbox@example.test", imapHost: "imap.example.test", imapPort: 993,
    encryptedPassword: 'mail,"secret:tag', encryptionIv: "iv",
    retailerLogins: [login("Target"), login("Costco"), login("Target", false)],
  };
  state.accounts = [account, { ...account }, { ...account, retailerLogins: [login("Target", false)] }];
  const sheetRow = Array(29).fill("");
  Object.assign(sheetRow, { 5: "4111111111111111", 6: "07", 7: "30", 8: "0335", 28: JSON.stringify({ acoAccountId: "account-1", retailer: "Target" }) });
  state.sheetRows = [sheetRow];
  const dependencies = {
    "@chudaco/db": {
      prisma: { acoAccount: { findMany: async (query) => { state.query = query; return state.accounts; } } },
      getImapEncryptionKeyFromEnv: () => "key",
      decrypt: (ciphertext) => { if (state.decryptFails) throw new Error("bad key"); return ciphertext; },
    },
    "next/server": { NextRequest, NextResponse },
    googleapis: { google: {
      auth: { GoogleAuth: class {} },
      sheets: () => ({ spreadsheets: { values: { get: async () => {
        state.sheetCalls += 1;
        if (state.sheetFails) throw new Error("Sheets unavailable");
        return { data: { values: state.sheetRows } };
      } } } }),
    } },
    "@/lib/payment-info": { getGoogleSheetsConfig: () => ({ spreadsheetId: "sheet", sheetName: "cards", keyPath: "key" }) },
    "@/lib/sheet-card": loadHelper("sheet-card.ts"),
    "@/lib/export-email": loadHelper("export-email.ts"),
    "@/lib/aco-library": { withRetailerProfile: (account, retailer) => ({
      ...account,
      ...account.retailerProfiles.find((entry) => entry.retailer.toLowerCase() === retailer.toLowerCase())?.profile,
    }) },
    zod: require("zod"),
    "@/lib/api-auth": { getAuthenticatedContext: async () => state.auth, getAdminDiscordIds: () => new Set(["admin"]) },
    "@/lib/admin-export": { accountIdFilter: (request) => {
      const ids = request.nextUrl.searchParams.get("accountIds");
      return ids ? { id: { in: ids.split(",") } } : {};
    } },
  };
  const source = fs.readFileSync(path.resolve(__dirname, "../app/api/admin/export/shikari/route.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: (name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return { state, get: (query = "") => exports.GET(new NextRequest(`http://localhost/api/admin/export/shikari${query}`)) };
}

test("accounts default to Target, deduplicate enabled logins, and apply account selection", async () => {
  const { state, get } = setup();
  const response = await get("?accountIds=selected");
  assert.equal(await response.text(), "target@retailer.test:retail-secret");
  assert.equal(state.query.where.id.in[0], "selected");
  assert.equal(state.query.where.OR[0].retailer.equals, "Target");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-disposition"), /shikari-accounts.txt/);
  assert.equal(state.sheetCalls, 0);
});

test("IMAP uses the required header, mailbox credentials, CSV escaping, and one row per shared mailbox", async () => {
  const { get } = setup();
  const response = await get("?mode=imap");
  assert.equal(await response.text(), 'imap_server,port,username,password\r\nimap.example.test,993,mailbox@example.test,"mail,""secret"');
  assert.match(response.headers.get("content-type"), /text\/csv/);
  assert.match(response.headers.get("content-disposition"), /shikari-imap.csv/);
});

test("retailer selection is case insensitive and supports legacy accounts", async () => {
  const { state, get } = setup();
  assert.equal(await (await get("?retailers=costco")).text(), "costco@retailer.test:retail-secret");
  state.accounts = [{ ...state.accounts[0], retailerLogins: [] }];
  assert.equal(await (await get()).text(), "legacy@retailer.test:legacy-secret");
});

test("disabled logins and incomplete credentials are excluded", async () => {
  const { state, get } = setup();
  state.accounts = [state.accounts[2], { ...state.accounts[0], encryptedPassword: null, retailerLogins: [] , loginEmail: null }];
  assert.equal(await (await get()).text(), "");
  assert.equal(await (await get("?mode=imap")).text(), "imap_server,port,username,password");
});

test("unauthenticated and non-admin requests never query credentials", async () => {
  const { state, get } = setup();
  state.auth = null;
  assert.equal((await get()).status, 401);
  state.auth = { discordId: "not-admin" };
  assert.equal((await get()).status, 403);
  assert.equal(state.query, null);
});

test("invalid queries, unrepresentable TXT credentials, and decryption failures return errors", async () => {
  const { state, get } = setup();
  assert.equal((await get("?mode=other")).status, 400);
  assert.equal((await get("?retailers=,,")).status, 400);
  state.accounts[0].retailerLogins[0].loginEmail = "invalid\nusername";
  assert.equal((await get()).status, 400);
  state.decryptFails = true;
  assert.equal((await get()).status, 500);
});

const profileHeader = "profile_name,first_name,last_name,email,phone_num,cc_number,cc_exp_month,cc_exp_year,cc_cvv,shipping_street,shipping_street_2,shipping_city,shipping_state,shipping_zip_code,shipping_country,billing_first_name,billing_last_name,billing_street,billing_street_2,billing_city,billing_state,billing_zip_code,billing_country";

test("profiles match the sample columns, escape CSV, preserve leading zeros, and use shipping for same billing", async () => {
  const { state, get } = setup();
  const response = await get("?mode=profiles&accountIds=account-1");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), profileHeader + '\r\n"testuser - ""Primary"", card",Test,User,target@retailer.test,0123456789,4111111111111111,07,2030,0335,123 Test St,Unit 2,Boston,MA,02108,US,Test,User,123 Test St,Unit 2,Boston,MA,02108,US');
  assert.equal(state.query.where.id.in[0], "account-1");
  assert.match(response.headers.get("content-disposition"), /shikari-profiles.csv/);
  assert.match(response.headers.get("content-type"), /text\/csv/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("profiles select retailer-scoped cards and linked profiles for each enabled selected retailer", async () => {
  const { state, get } = setup();
  const account = state.accounts[0];
  account.retailerCards = [{ retailer: "Costco", last4: "4444", expMonth: 9, expYear: 2029 }];
  account.retailerProfiles = [{ retailer: "Costco", profile: {
    shippingName: "Retailer Person", shippingAddr: "456 Retailer St", shippingCity: "Seattle", shippingState: "WA", shippingZip: "98101",
    billingSameAsShipping: false, billingName: "Billing Person", billingAddr: "789 Billing St\nSuite 3", billingCity: "Portland", billingState: "OR", billingZip: "97201",
  } }];
  const row = [...state.sheetRows[0]];
  Object.assign(row, { 5: "5555555555554444", 6: "09", 7: "2029", 8: "012", 28: JSON.stringify({ acoAccountId: "account-1", retailer: "Costco" }) });
  state.sheetRows.unshift(row);
  state.accounts = [account];
  const response = await get("?mode=profiles&retailers=target,costco");
  assert.equal(response.status, 200);
  const lines = (await response.text()).split("\r\n");
  assert.equal(lines.length, 3);
  assert.match(lines[1], /target@retailer.test,0123456789,4111111111111111,07,2030,0335/);
  assert.match(lines[2], /Retailer,Person,costco@retailer.test,0123456789,5555555555554444,09,2029,012,456 Retailer St,,Seattle,WA,98101,US,Billing,Person,789 Billing St,Suite 3,Portland,OR,97201,US$/);
});

test("profiles exclude disabled logins, support legacy accounts, and reject missing full card details", async () => {
  const { state, get } = setup();
  state.accounts = [state.accounts[2]];
  assert.equal(await (await get("?mode=profiles")).text(), profileHeader);
  state.accounts = [{ ...state.accounts[0], retailerLogins: [] }];
  assert.match(await (await get("?mode=profiles")).text(), /legacy@retailer.test/);
  state.sheetRows = [];
  const missingResponse = await get("?mode=profiles");
  assert.equal(missingResponse.status, 400);
  const missingPayload = await missingResponse.json();
  assert.match(missingPayload.error, /Target.*card number, CVV/);
  assert.match(missingPayload.error, /No matching payment-sheet row/);
  state.sheetFails = true;
  assert.equal((await get("?mode=profiles")).status, 500);
});

test("profile card formatting tolerates whitespace and reports invalid fields without revealing card data", async () => {
  const { state, get } = setup();
  Object.assign(state.sheetRows[0], { 6: " 07 ", 7: " 30 ", 8: " 0335 " });
  assert.equal((await get("?mode=profiles")).status, 200);
  state.sheetRows[0][8] = "35";
  const response = await get("?mode=profiles");
  assert.equal(response.status, 400);
  const { error } = await response.json();
  assert.match(error, /Target.*invalid CVV/);
  assert.ok(!error.includes(state.sheetRows[0][5]));
});

test("an incomplete profile does not block valid profiles and returns a visible skip warning", async () => {
  const { state, get } = setup();
  const validAccount = state.accounts[0];
  state.accounts = [{ ...validAccount, id: "missing-card", botProfileName: "testuser - Missing", cardOnFile: null }, validAccount];
  const response = await get("?mode=profiles");
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.equal(text.split("\r\n").length, 2);
  assert.ok(!text.includes("testuser - Missing"));
  assert.equal(response.headers.get("X-Export-Skipped-Count"), "1");
  const warning = decodeURIComponent(response.headers.get("X-Export-Warning"));
  assert.match(warning, /Skipped 1 incomplete profile/);
  assert.match(warning, /testuser - Missing/);
  assert.ok(!warning.includes(state.sheetRows[0][5]));
});