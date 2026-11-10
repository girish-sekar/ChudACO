const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");
const { NextRequest, NextResponse } = require("next/server");

function setup() {
  const state = { batch: null, pulls: [], jobs: [], transactions: 0 };
  const tx = {
    accountPullExport: {
      upsert: async ({ create }) => state.batch ??= { ...create, id: "batch", parts: [] },
      update: async ({ data }) => Object.assign(state.batch, data),
    },
    acoAccount: { findMany: async () => [{ id: "a1", userId: "u1", accountNumber: 1 }, { id: "a2", userId: "u1", accountNumber: 2 }] },
    accountPull: { createMany: async ({ data }) => state.pulls.push(...data) },
    accountPullNotification: { createMany: async ({ data }) => state.jobs.push(...data) },
  };
  const dependencies = {
    "node:crypto": require("node:crypto"), "next/server": { NextResponse },
    "@chudaco/db": { prisma: { $transaction: async (callback) => { state.transactions += 1; return callback(tx); } } },
  };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, "account-pulls.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  vm.runInNewContext(outputText, { exports, URLSearchParams, require: (name) => dependencies[name] });
  const request = (method = "POST", query = "", parts = "1") => new NextRequest(`http://localhost/api/admin/export/accounts-txt${query}`, {
    method, headers: { "X-Export-Action": "12345678-1234-1234-1234-123456789012", "X-Export-Parts": parts },
  });
  const finish = (req, included, type = "accounts") => exports.finishPullExport(req, "admin", type, included, new NextResponse("file"));
  return { state, request, finish, normalize: exports.normalizePullRetailer };
}

test("GET remains read-only and uncached", async () => {
  const { state, request, finish } = setup();
  const response = await finish(request("GET"), [{ id: "a1", retailer: "Target" }]);
  assert.equal(state.transactions, 0);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("only included accounts are recorded; aliases and request retries deduplicate", async () => {
  const { state, request, finish } = setup();
  const included = [{ id: "a1", retailer: "PKC" }, { id: "a1", retailer: "PokemonCenter" }];
  await finish(request(), included);
  await finish(request(), included);
  assert.equal(state.pulls.length, 1);
  assert.equal(state.pulls[0].retailer, "Pokemon Center");
  assert.equal(state.jobs.length, 1);
  assert.ok(state.batch.completedAt);
});

test("companion files wait for completion and filter reuse is rejected", async () => {
  const { state, request, finish } = setup();
  await finish(request("POST", "?category=stellar&mode=default", "2"), [{ id: "a1", retailer: "Costco" }]);
  assert.equal(state.batch.completedAt, null);
  await finish(request("POST", "?category=stellar&mode=imap", "2"), [{ id: "a1", retailer: "Costco" }], "imap");
  assert.ok(state.batch.completedAt);
  const response = await finish(request("POST", "?category=valor", "2"), []);
  assert.equal(response.status, 409);
});

test("empty exports do not create pulls or notification jobs", async () => {
  const { state, request, finish } = setup();
  await finish(request(), []);
  assert.equal(state.pulls.length, 0);
  assert.equal(state.jobs.length, 0);
});

test("completed action IDs cannot be reused for different export types", async () => {
  const { request, finish } = setup();
  await finish(request(), [{ id: "a1", retailer: "Target" }]);
  const response = await finish(request(), [{ id: "a1", retailer: "Target" }], "imap");
  assert.equal(response.status, 409);
});

test("retries with changed account inclusion require a new action", async () => {
  const { request, finish, state } = setup();
  await finish(request(), [{ id: "a1", retailer: "Target" }]);
  const response = await finish(request(), [{ id: "a1", retailer: "Target" }, { id: "a2", retailer: "Target" }]);
  assert.equal(response.status, 409);
  assert.equal(state.pulls.length, 1);
});

test("history and latest pulls are scoped to the signed-in user and paginated", async () => {
  const queries = [];
  let auth = { userId: "u1" };
  const rows = Array.from({ length: 21 }, (_, index) => ({ id: `pull${index}`, accountNumber: index, retailer: "Target" }));
  const dependencies = {
    "next/server": { NextResponse },
    "@/lib/api-auth": { getAuthenticatedContext: async () => auth },
    "@chudaco/db": { prisma: {
      accountPull: { findMany: async (query) => { queries.push(query); return rows; } },
      user: { findUnique: async (query) => { assert.equal(query.where.id, "u1"); return { notifyOnAccountPull: false }; } },
    } },
  };
  const source = fs.readFileSync(path.join(__dirname, "../app/api/account-pulls/route.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: (name) => dependencies[name] });
  const response = await exports.GET(new NextRequest("http://localhost/api/account-pulls?cursor=previous&userId=u2"));
  const payload = await response.json();
  assert.equal(payload.data.length, 20);
  assert.equal(payload.nextCursor, "pull19");
  assert.equal(payload.notifyOnAccountPull, false);
  assert.ok(queries.every((query) => query.where.userId === "u1"));
  assert.equal(queries[0].cursor.id, "previous");
  assert.ok(!queries[0].select.userId);
  assert.equal(response.headers.get("cache-control"), "no-store");
  auth = null;
  assert.equal((await exports.GET(new NextRequest("http://localhost/api/account-pulls"))).status, 401);
  assert.equal(queries.length, 2);
});

test("pull activity matches retailer aliases and saves a separate DM preference", async () => {
  const slots = [];
  let cursor = 0;
  const requests = [];
  const dependencies = {
    react: { useState: (initial) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = value; }];
    } },
    "react/jsx-runtime": require("react/jsx-runtime"), "lucide-react": require("lucide-react"),
    swr: { default: () => ({}) }, "@/lib/dashboard": { fetchJson: async () => ({}) },
  };
  const source = fs.readFileSync(path.join(__dirname, "../app/dashboard/accounts/pull-activity.tsx"), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: (name) => dependencies[name], fetch: async (url, options) => {
    requests.push({ url, ...options }); return { ok: true };
  } });
  const pull = { id: "pull", acoAccountId: "a1", accountNumber: 1, retailer: "Pokemon Center", exportType: "imap", createdAt: "2026-11-08T12:00:00Z" };
  assert.equal(exports.latestAccountPull([pull], "a1", "PKC"), pull);
  assert.equal(exports.latestAccountPull([pull], "a2", "PKC"), undefined);
  const data = { data: [pull], latest: [pull], notifyOnAccountPull: true, nextCursor: null };
  let refreshed = 0;
  const tree = exports.AccountPullActivity({ data, error: false, onRefresh: async () => { refreshed += 1; } });
  const elements = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node?.props) return;
    elements.push(node); visit(node.props.children);
  };
  visit(tree);
  const toggle = elements.find((node) => node.props.type === "checkbox");
  assert.equal(toggle.props.checked, true);
  toggle.props.onChange({ target: { checked: false } });
  await new Promise(setImmediate);
  assert.equal(requests[0].url, "/api/profile");
  assert.equal(requests[0].method, "PATCH");
  assert.equal(requests[0].body, JSON.stringify({ notifyOnAccountPull: false }));
  assert.equal(refreshed, 1);
  assert.ok(elements.some((node) => node.type === "time" && node.props.dateTime === pull.createdAt));
});