const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const item = "30th Celebration Elite Trainer Box";
const from = new Date("2026-10-16T00:00:00.000Z");
const to = new Date("2026-10-16T23:59:59.999Z");

function loadKnownItemPricing() {
  const filename = path.join(__dirname, "known-item-pricing.ts");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = { exports: {} };
  vm.runInNewContext(source, context, { filename });
  return context.exports;
}

function loadPricing() {
  const filename = path.join(__dirname, "drop-summary-pricing.ts");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = {
    exports: {},
    require: (name) => name === "./known-item-pricing" ? loadKnownItemPricing() : require(name),
  };
  vm.runInNewContext(source, context, { filename });
  return context.exports;
}

async function summarize({ registered = false, displayName = null, checkouts = true, checkoutCount = 1, messageCount = 3, product = item, checkoutPrice = 139.98, messagePrice = 139.98, mentionedUser = null } = {}) {
  const checkout = {
    id: "checkout-1",
    acoAccountId: "account-1",
    userId: "buyer-1",
    user: { id: "buyer-1", username: "girishsekar", discordId: "registered-discord-id" },
    acoAccount: { id: "account-1", label: "Account 1" },
    item: product,
    retailer: "Target",
    price: checkoutPrice,
    qtyLabel: "Qty 2",
    occurredAt: new Date("2026-10-16T07:26:22.328Z"),
  };
  const checkoutRows = Array.from({ length: checkoutCount }, (_, index) => ({
    ...checkout,
    id: `checkout-${index}`,
    occurredAt: new Date(checkout.occurredAt.getTime() + index * 1000),
  }));
  const messages = ["07:27:26.298", "07:31:16.391", "07:32:27.694"].slice(0, messageCount).map((time, index) => ({
    messageId: `message-${index}`,
    occurredAt: new Date(`2026-10-16T${time}Z`),
    profile: `yeeming - ${index === 1 ? "William's amex" : "William Chase"}`,
    item: product,
    quantity: "2",
    price: messagePrice,
    imageUrl: null,
    mentionedUser,
  }));
  const mocks = {
    "@chudaco/db": {
      prisma: {
        checkout: { findMany: async () => checkouts ? checkoutRows : [] },
        pricingRule: { findMany: async () => [] },
        acoAccount: { findMany: async () => [] },
        user: {
          findMany: async () => [{ id: "buyer-1", discordId: "registered-discord-id" }],
          findUnique: async ({ where }) => where.discordId === "registered-discord-id"
            ? { id: "buyer-1", username: "registered-buyer" }
            : where.id === "buyer-1"
              ? { id: "buyer-1", username: "registered-buyer" }
            : where.discordId === "346422586931937280"
              ? { id: "fallback-buyer", username: "steak_n_fries" }
              : null,
        },
      },
    },
    "next/server": { NextResponse: { json: (data) => data } },
    "@/lib/api-auth": {
      getAuthenticatedContext: async () => ({ discordId: "admin" }),
      getAdminDiscordIds: () => new Set(["admin"]),
    },
    "@/lib/drop-summary-pricing": loadPricing(),
    "@/lib/discord-success": {
      fetchDiscordSuccessMessages: async () => ({ messages, scanned: messages.length, error: null }),
      parseUsernameFromProfile: (profile) => profile.split(" - ")[0],
      resolveDiscordUsername: async () => registered ? { discordId: "registered-discord-id" } : null,
      resolveDiscordDisplayName: async (discordId) => {
        assert.equal(discordId, "registered-discord-id");
        return displayName;
      },
    },
  };
  const filename = path.join(__dirname, "../app/api/admin/drop-summary/route.ts");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = {
    exports: {},
    require: (name) => mocks[name] ?? require(name),
    Date,
  };
  vm.runInNewContext(source, context, { filename });
  return context.exports.GET({
    nextUrl: { searchParams: new URLSearchParams({ from: from.toISOString(), to: to.toISOString() }) },
  });
}

test("keeps all three unidentified buyer successes despite nearby identical checkouts", async () => {
  const summary = await summarize();
  assert.equal(summary.reconciliation.matchedInDatabase, 0);
  assert.equal(summary.reconciliation.gapCount, 3);
  assert.equal(summary.totals.successfulCheckouts, 3);
  assert.equal(summary.totals.totalDollarVolume, "419.94");
  assert.equal(summary.reconciliation.gapVolume, "419.94");
});

test("attributes unmatched successes to their Discord mention before the fallback buyer", async () => {
  const summary = await summarize({
    mentionedUser: { id: "discord-yeeming", username: "yeeming", displayName: "Yeeming" },
  });
  const buyer = summary.topBuyers.find((entry) => entry.username === "Yeeming");
  assert.ok(buyer);
  assert.equal(buyer.count, 3);
  assert.equal(summary.topBuyers.some((entry) => entry.username === "steak_n_fries"), false);
  assert.ok(summary.reconciliation.gaps.every((gap) => gap.username === "Yeeming"));
});

test("still reconciles successes when the buyer identity matches the checkout", async () => {
  const summary = await summarize({ registered: true, messageCount: 1 });
  assert.equal(summary.reconciliation.matchedInDatabase, 1);
  assert.equal(summary.reconciliation.gapCount, 0);
  assert.equal(summary.totals.successfulCheckouts, 1);
});

test("uses three Discord successes instead of six database rows", async () => {
  const summary = await summarize({
    registered: true,
    checkoutCount: 6,
    mentionedUser: { id: "froakieflick-discord-id", username: "girishsekar8392", displayName: "FroakieFlick" },
  });

  assert.equal(summary.sourceOfTruth, "discord");
  assert.equal(summary.totals.successfulCheckouts, 3);
  assert.equal(summary.reconciliation.matchedInDatabase, 3);
  assert.equal(summary.reconciliation.databaseOnlyCount, 3);
  assert.equal(summary.reconciliation.gapCount, 0);
  assert.equal(summary.topBuyers[0].username, "FroakieFlick");
  assert.equal(summary.topBuyers[0].count, 3);
  assert.equal(summary.recent.length, 3);
});

test("uses two Discord successes instead of three database rows", async () => {
  const summary = await summarize({
    registered: true,
    checkoutCount: 3,
    messageCount: 2,
    mentionedUser: { id: "concord-discord-id", username: "concord1389", displayName: "concord" },
  });

  assert.equal(summary.totals.successfulCheckouts, 2);
  assert.equal(summary.reconciliation.matchedInDatabase, 2);
  assert.equal(summary.reconciliation.databaseOnlyCount, 1);
  assert.equal(summary.topBuyers[0].username, "concord");
  assert.equal(summary.topBuyers[0].count, 2);
});

test("car order totals are $76 throughout the drop summary without reconciliation duplicates", async () => {
  for (const messagePrice of [38, 76, null]) {
    const summary = await summarize({
      registered: true,
      messageCount: 1,
      product: "Hot Wheels RLC Exclusive RWB Porsche 930",
      checkoutPrice: 38,
      messagePrice,
    });
    assert.equal(summary.reconciliation.gapCount, 0);
    assert.equal(summary.totals.successfulCheckouts, 1);
    assert.equal(summary.totals.totalDollarVolume, "76.00");
    assert.equal(summary.totals.averageOrderValue, "76.00");
    assert.equal(summary.byRetailer[0].volume, "76.00");
    assert.equal(summary.byItem[0].count, 2);
    assert.equal(summary.byItem[0].volume, "76.00");
    assert.equal(summary.byDay[0].volume, "76.00");
    assert.equal(summary.topBuyers[0].volume, "76.00");
    assert.equal(summary.recent[0].price, "76.00");
  }
});

test("Discord-only car successes contribute $76 per order and are not multiplied twice", async () => {
  for (const messagePrice of [38, 76, null]) {
    const summary = await summarize({
      checkouts: false,
      product: "Hot Wheels RLC Exclusive RWB Porsche 930",
      messagePrice,
    });
    assert.equal(summary.totals.successfulCheckouts, 3);
    assert.equal(summary.totals.totalDollarVolume, "228.00");
    assert.equal(summary.byItem[0].count, 6);
    assert.equal(summary.byItem[0].volume, "228.00");
    assert.equal(summary.reconciliation.gapVolume, "228.00");
    assert.equal(summary.reconciliation.gaps[0].price, "76.00");
  }
});

test("individual checkout summary counts two cars as $76 spent", () => {
  const filename = path.join(__dirname, "../app/dashboard/checkouts/user-summary.tsx");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  let summary;
  const mocks = {
    "next/image": () => null,
    "lucide-react": { Copy: () => null },
    react: {
      useMemo: (compute) => { summary = compute(); return summary; },
      useRef: () => ({ current: null }),
      useState: (initial) => [initial, () => {}],
    },
    "@/lib/drop-summary-pricing": loadPricing(),
    "@/lib/drop-summary-image": {
      copySummaryPng: async () => {},
      downloadSummaryPng: () => {},
      renderSummaryPng: async () => new Blob(),
    },
    "@/lib/dashboard": { toCurrency: (value) => `$${value}` },
  };
  const context = { exports: {}, require: (name) => mocks[name] ?? require(name), Date };
  vm.runInNewContext(source, context, { filename });
  for (const price of [38, 76, 0]) {
    context.exports.default({
      checkouts: [{ status: "success", item: "Hot Wheels RLC Exclusive RWB Porsche 930", retailer: "Mattel", qtyLabel: "Qty 2", price, occurredAt: from.toISOString() }],
      username: "FroakieFlick",
      avatarUrl: null,
      pricingRules: [],
    });
    assert.equal(summary.totalSpend, 76);
    assert.equal(summary.units, 2);
    assert.equal(summary.pricedCheckouts, 1);
    assert.equal(summary.topProducts[0].volume, 76);
  }
});

test("shows the Discord display name instead of the stored login for top buyers", async () => {
  const summary = await summarize({ registered: true, displayName: "FroakieFlick" });
  assert.equal(summary.topBuyers[0].username, "FroakieFlick");
  assert.equal(summary.topBuyers[0].userId, "buyer-1");
  assert.equal(summary.topBuyers[0].count, 3);
});

test("resolves the Discord display name for buyers with only reconciled successes", async () => {
  const summary = await summarize({ registered: true, displayName: "FroakieFlick", checkouts: false });
  assert.equal(summary.topBuyers[0].username, "FroakieFlick");
  assert.equal(summary.topBuyers[0].count, 3);
});

test("keeps the stored username when Discord display name lookup fails", async () => {
  const summary = await summarize({ registered: true });
  assert.equal(summary.topBuyers[0].username, "registered-buyer");
});

async function resolveDisplayName({ user, ok = true, token = "test-token", fail = false }) {
  const filename = path.join(__dirname, "discord-success.ts");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = {
    exports: {},
    require: (name) => name === "./known-item-pricing" ? loadKnownItemPricing() : require(name),
    process: { env: { DISCORD_BOT_TOKEN: token } },
    AbortSignal,
    fetch: async (url) => {
      assert.equal(url, "https://discord.com/api/v10/users/registered-discord-id");
      if (fail) throw new Error("Discord unavailable");
      return { ok, json: async () => user };
    },
  };
  vm.runInNewContext(source, context, { filename });
  return context.exports.resolveDiscordDisplayName("registered-discord-id");
}

test("Discord display name lookup prefers global name and falls back to username", async () => {
  assert.equal(await resolveDisplayName({ user: { global_name: "FroakieFlick", username: "girishsekar" } }), "FroakieFlick");
  assert.equal(await resolveDisplayName({ user: { global_name: null, username: "girishsekar" } }), "girishsekar");
});

test("Discord display name lookup tolerates missing configuration and API errors", async () => {
  assert.equal(await resolveDisplayName({ token: "" }), null);
  assert.equal(await resolveDisplayName({ ok: false }), null);
  assert.equal(await resolveDisplayName({ fail: true }), null);
});

test("links unmapped Yeeming checkouts to the fallback buyer", async () => {
  const summary = await summarize();
  assert.equal(summary.totals.uniqueBuyers, 1);
  const buyer = summary.topBuyers.find((entry) => entry.username === "steak_n_fries");
  assert.ok(buyer);
  assert.equal(buyer.userId, "fallback-buyer");
  assert.equal(buyer.count, 3);
  assert.equal(buyer.volume, "419.94");
  for (const gap of summary.reconciliation.gaps) {
    assert.equal(gap.username, "steak_n_fries");
    assert.equal(gap.userId, "fallback-buyer");
    assert.equal(gap.resolved, true);
  }
});