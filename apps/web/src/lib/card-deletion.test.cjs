const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

function load(relativePath, dependencies) {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

function setup() {
  const state = {
    authenticated: true,
    owned: true,
    sheetsFail: false,
    rows: [
      { acoAccountId: "account", retailer: null },
      { acoAccountId: "account", retailer: "Sam's Club" },
      { acoAccountId: "account", retailer: "Costco" },
      { acoAccountId: "account-other", retailer: "Sam's Club" },
      { acoAccountId: "account", retailer: "Sam's Club" },
    ],
    defaultCard: true,
    cards: ["Sam's Club", "Costco"],
  };
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { title: "Test", sheetId: 1 } }] } }),
    values: {
      get: async () => {
        if (state.sheetsFail) throw new Error("Sheets unavailable");
        return { data: { values: state.rows.map((row) => [JSON.stringify(row)]) } };
      },
    },
    batchUpdate: async ({ requestBody }) => {
      for (const request of requestBody.requests) {
        const { startIndex, endIndex } = request.deleteDimension.range;
        state.rows.splice(startIndex - 1, endIndex - startIndex);
      }
    },
  } };
  const relay = load("google-sheets-relay.ts", {
    googleapis: { google: { auth: { GoogleAuth: class {} }, sheets: () => sheets } },
    "@/lib/payment-info": { getGoogleSheetsConfig: () => ({ sheetName: "Test" }) },
    "@/lib/sheet-card": load("sheet-card.ts", {}),
  });
  const route = load("../app/api/aco-accounts/[id]/payment-info/route.ts", {
    "@chudaco/db": { prisma: {
      acoAccount: { findFirst: async ({ where }) => {
        assert.equal(where.id, "account");
        assert.equal(where.userId, "owner");
        return state.owned ? { id: "account" } : null;
      } },
      cardOnFile: { deleteMany: async ({ where }) => {
        assert.equal(where.acoAccountId, "account");
        state.defaultCard = false;
      } },
      acoRetailerCard: { deleteMany: async ({ where }) => {
        assert.equal(where.acoAccountId, "account");
        state.cards = state.cards.filter((retailer) => retailer.toLowerCase() !== where.retailer.equals.toLowerCase());
      } },
    } },
    "next/server": require("next/server"),
    "@/lib/api-auth": { getAuthenticatedContext: async () => state.authenticated ? { userId: "owner" } : null },
    "@/lib/google-sheets-relay": relay,
    "@/lib/payment-info": {},
  });
  const remove = (body) => route.DELETE({ json: async () => body }, { params: { id: "account" } });
  return { state, remove };
}

test("deleting a retailer removes its DB card and all matching sheet rows, leaving other cards untouched", async () => {
  const { state, remove } = setup();
  assert.equal((await remove({ retailer: " sam's club " })).status, 200);
  assert.deepEqual(state.cards, ["Costco"]);
  assert.equal(state.defaultCard, true);
  assert.deepEqual(state.rows, [
    { acoAccountId: "account", retailer: null },
    { acoAccountId: "account", retailer: "Costco" },
    { acoAccountId: "account-other", retailer: "Sam's Club" },
  ]);
  assert.equal((await remove({ retailer: "Sam's Club" })).status, 200);
  assert.equal(state.rows.length, 3);
});

test("explicit default-card deletion leaves retailer cards intact", async () => {
  const { state, remove } = setup();
  assert.equal((await remove({ retailer: null })).status, 200);
  assert.equal(state.defaultCard, false);
  assert.deepEqual(state.cards, ["Sam's Club", "Costco"]);
  assert.equal(state.rows.length, 4);
});

test("a Sheets failure keeps the database card for retry", async () => {
  const { state, remove } = setup();
  state.sheetsFail = true;
  assert.equal((await remove({ retailer: "Sam's Club" })).status, 502);
  assert.deepEqual(state.cards, ["Sam's Club", "Costco"]);
  assert.equal(state.rows.length, 5);
  state.sheetsFail = false;
  assert.equal((await remove({ retailer: "Sam's Club" })).status, 200);
});

test("missing scope cannot delete all cards", async () => {
  const { state, remove } = setup();
  for (const body of [null, {}, { retailer: "" }, { retailer: 1 }]) {
    assert.equal((await remove(body)).status, 400);
  }
  assert.equal(state.rows.length, 5);
  assert.equal(state.defaultCard, true);
});

test("unauthenticated and non-owner requests cannot delete cards", async () => {
  const { state, remove } = setup();
  state.authenticated = false;
  assert.equal((await remove({ retailer: "Sam's Club" })).status, 401);
  state.authenticated = true;
  state.owned = false;
  assert.equal((await remove({ retailer: "Sam's Club" })).status, 403);
  assert.equal(state.rows.length, 5);
  assert.deepEqual(state.cards, ["Sam's Club", "Costco"]);
});