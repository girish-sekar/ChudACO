const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");
const { NextRequest, NextResponse } = require("next/server");

function setup() {
  const state = { auth: { discordId: "admin" }, query: null, decryptFails: false };
  const login = (retailer, enabled = true) => ({
    retailer, enabled, loginEmail: `${retailer.toLowerCase()}@retailer.test`,
    encryptedLoginPassword: "retail-secret:tag", loginPasswordIv: "iv",
  });
  const account = {
    retailer: "Target", loginEmail: "legacy@retailer.test",
    encryptedLoginPassword: "legacy-secret:tag", loginPasswordIv: "iv",
    email: "mailbox@example.test", imapHost: "imap.example.test", imapPort: 993,
    encryptedPassword: 'mail,"secret:tag', encryptionIv: "iv",
    retailerLogins: [login("Target"), login("Costco"), login("Target", false)],
  };
  state.accounts = [account, { ...account }, { ...account, retailerLogins: [login("Target", false)] }];
  const dependencies = {
    "@chudaco/db": {
      prisma: { acoAccount: { findMany: async (query) => { state.query = query; return state.accounts; } } },
      getImapEncryptionKeyFromEnv: () => "key",
      decrypt: (ciphertext) => { if (state.decryptFails) throw new Error("bad key"); return ciphertext; },
    },
    "next/server": { NextRequest, NextResponse },
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