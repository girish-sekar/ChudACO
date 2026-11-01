const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

function setup(responses = []) {
  const state = {
    now: 0, calls: [], delays: [], logs: [],
    env: { DISCORD_GUILD_ID: "123", PREMIUM_ROLE_ID: "456", DISCORD_BOT_TOKEN: "secret-token" },
  };
  const source = fs.readFileSync(path.join(__dirname, "premium.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require: (name) => { assert.equal(name, "server-only"); return {}; },
    process: { env: state.env },
    Date: { now: () => state.now },
    AbortSignal,
    console: { error: (...args) => state.logs.push(args) },
    setTimeout: (resolve, delay) => { state.delays.push(delay); resolve(); },
    fetch: async (...args) => {
      state.calls.push(args);
      const response = responses.shift();
      if (response instanceof Error) throw response;
      assert.ok(response, "Unexpected fetch");
      return response;
    },
  });
  return { ...exports, state };
}

const response = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test("premium is granted solely by the configured role and uses a server bot request", async () => {
  const { isPremium, state } = setup([response(200, { roles: ["456"] })]);
  assert.equal(await isPremium("789"), true);
  assert.equal(state.calls[0][0], "https://discord.com/api/v10/guilds/123/members/789");
  assert.equal(state.calls[0][1].headers.Authorization, "Bot secret-token");
  assert.equal(state.calls[0][1].cache, "no-store");
  assert.ok(state.calls[0][1].signal);
});

test("absent role and non-member return false", async () => {
  for (const result of [response(200, { roles: ["other-role"] }), response(404)]) {
    const { isPremium } = setup([result]);
    assert.equal(await isPremium("789"), false);
  }
});

test("429 respects retry_after once and can recover", async () => {
  const { isPremium, state } = setup([response(429, { retry_after: 0.25 }), response(200, { roles: ["456"] })]);
  assert.equal(await isPremium("789"), true);
  assert.deepEqual(state.delays, [250]);
  assert.equal(state.calls.length, 2);
});

test("repeated 429 fails closed and logs without a second delay", async () => {
  const { isPremium, state } = setup([response(429, { retry_after: 1 }), response(429, { retry_after: 1 })]);
  assert.equal(await isPremium("789"), false);
  assert.deepEqual(state.delays, [1000]);
  assert.equal(state.calls.length, 2);
  assert.equal(state.logs.length, 1);
});

test("invalid or unrepresentable retry delays fail closed", async () => {
  for (const retry_after of [undefined, "1", -1, Infinity, 2_147_484]) {
    const { isPremium, state } = setup([response(429, { retry_after })]);
    assert.equal(await isPremium("789"), false);
    assert.equal(state.calls.length, 1);
    assert.equal(state.delays.length, 0);
    assert.equal(state.logs.length, 1);
  }
});

test("valid longer Discord retry delays are respected", async () => {
  const { isPremium, state } = setup([response(429, { retry_after: 11 }), response(200, { roles: ["456"] })]);
  assert.equal(await isPremium("789"), true);
  assert.deepEqual(state.delays, [11_000]);
});

test("HTTP, network, and malformed response errors fail closed without secret logs", async () => {
  for (const result of [response(500), new Error("secret-token"), response(200, {}), response(200, { roles: [456] }),
    { ...response(200), json: async () => { throw new Error("secret-token"); } }]) {
    const { isPremium, state } = setup([result]);
    assert.equal(await isPremium("789"), false);
    assert.equal(state.logs.length, 1);
    assert.ok(!JSON.stringify(state.logs).includes("secret-token"));
  }
});

test("positive and negative results are cached per user for exactly two minutes", async () => {
  for (const roles of [["456"], []]) {
    const { isPremium, state } = setup([response(200, { roles }), response(200, { roles: [] }), response(404)]);
    const expected = roles.length > 0;
    assert.equal(await isPremium("789"), expected);
    state.now = 119_999;
    assert.equal(await isPremium("789"), expected);
    assert.equal(state.calls.length, 1);
    assert.equal(await isPremium("987"), false);
    state.now = 120_000;
    assert.equal(await isPremium("789"), false);
    assert.equal(state.calls.length, 3);
  }
});

test("cache invalidation forces a fresh role lookup", async () => {
  const { isPremium, invalidatePremiumCache, state } = setup([
    response(200, { roles: ["456"] }), response(200, { roles: [] }),
  ]);
  assert.equal(await isPremium("789"), true);
  await invalidatePremiumCache("789");
  assert.equal(await isPremium("789"), false);
  assert.equal(state.calls.length, 2);
});

test("missing config fails clearly on first use, even with a cached positive", async () => {
  for (const name of ["DISCORD_GUILD_ID", "PREMIUM_ROLE_ID", "DISCORD_BOT_TOKEN"]) {
    const { isPremium, state } = setup([response(200, { roles: ["456"] })]);
    assert.equal(await isPremium("789"), true);
    delete state.env[name];
    assert.equal(await isPremium("789"), false);
    assert.match(state.logs[0][0], new RegExp(name));
    assert.equal(state.calls.length, 1);
  }
});

test("invalid or missing Discord IDs never make a request", async () => {
  const { isPremium, state } = setup();
  assert.equal(await isPremium(""), false);
  assert.equal(await isPremium("../user"), false);
  assert.equal(state.calls.length, 0);
});

function load(file, dependencies, globals = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, file), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require: (name) => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
    ...globals,
  });
  return exports;
}

test("premium endpoint uses only the authenticated Discord ID, disables HTTP caching, and fails closed", async () => {
  const { NextResponse } = require("next/server");
  const state = { context: { discordId: "789" }, premium: true, calls: [], authError: false };
  const { GET, dynamic } = load("../app/api/me/premium/route.ts", {
    "next/server": { NextResponse },
    "@/lib/api-auth": { getAuthenticatedContext: async () => {
      if (state.authError) throw new Error("secret");
      return state.context;
    } },
    "@/lib/premium": { isPremium: async (id) => { state.calls.push(id); return state.premium; } },
  }, { console: { error() {} } });
  assert.equal(dynamic, "force-dynamic");
  const result = await GET();
  assert.deepEqual(await result.json(), { premium: true });
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(state.calls, ["789"]);
  state.premium = false;
  assert.deepEqual(await (await GET()).json(), { premium: false });
  state.context = null;
  const unauthorized = await GET();
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).premium, false);
  assert.equal(state.calls.length, 2);
  state.authError = true;
  const failed = await GET();
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { premium: false });
});

function findElements(tree, predicate) {
  const found = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object" || !node.props) return;
    if (predicate(node)) found.push(node);
    visit(node.props.children);
  }
  visit(tree);
  return found;
}

test("login renders the Whop link below sign-in with safe attributes and helper text", () => {
  const SignInButton = () => null;
  const whopUrl = "https://whop.com/example";
  const { default: LoginPage } = load("../app/login/page.tsx", {
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@/components/sign-in-button": { SignInButton },
    "next/link": { default: () => null },
  }, { process: { env: { NEXT_PUBLIC_WHOP_URL: whopUrl } } });
  const tree = LoginPage();
  const link = findElements(tree, (node) => node.type === "a")[0];
  assert.equal(link.props.children, "Get Premium on Whop");
  assert.equal(link.props.href, whopUrl);
  assert.equal(link.props.target, "_blank");
  assert.equal(link.props.rel, "noopener noreferrer");
  assert.equal(findElements(tree, (node) => node.type === "p" && node.props.children ===
    "Connect the same Discord account you sign in with when checking out.").length, 1);
  const controls = findElements(tree, (node) => node.type === "a" || node.type === SignInButton);
  assert.equal(controls[0].type, SignInButton);
  assert.equal(controls[1], link);
});

test("dashboard renders upgrade only for non-premium users, without an admin bypass", async () => {
  const state = { premium: false, calls: [] };
  const whopUrl = "https://whop.com/example";
  const { default: DashboardLayout } = load("../app/dashboard/layout.tsx", {
    "react/jsx-runtime": require("react/jsx-runtime"),
    "next/navigation": { redirect: () => { throw new Error("Unexpected redirect"); } },
    "@chudaco/db": { prisma: { user: { findUnique: async () => ({ termsVersion: "current" }) } } },
    "@/auth": { auth: async () => ({ user: { discordId: "789" } }), signOut: async () => {} },
    "@/components/dashboard/nav": { DashboardNav: () => null },
    "@/lib/terms": { CURRENT_TERMS_VERSION: "current" },
    "@/lib/premium": { isPremium: async (id) => { state.calls.push(id); return state.premium; } },
  }, { process: { env: { NEXT_PUBLIC_WHOP_URL: whopUrl, ADMIN_DISCORD_IDS: "789" } } });
  const tree = await DashboardLayout({ children: null });
  const link = findElements(tree, (node) => node.type === "a")[0];
  assert.equal(link.props.children, "Upgrade to Premium");
  assert.equal(link.props.href, whopUrl);
  assert.equal(link.props.target, "_blank");
  assert.equal(link.props.rel, "noopener noreferrer");
  state.premium = true;
  assert.equal(findElements(await DashboardLayout({ children: null }), (node) => node.type === "a").length, 0);
  assert.deepEqual(state.calls, ["789", "789"]);
});