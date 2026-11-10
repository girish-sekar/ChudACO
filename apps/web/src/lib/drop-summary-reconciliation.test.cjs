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

async function summarize({ registered = false, discordMember = false, profilePrefix = "yeeming", profileFormat = "standard", profileUser = null, displayName = null, checkouts = true, checkoutCount = 1, messageCount = 3, product = item, checkoutPrice = 139.98, messagePrice = 139.98, mentionedUser = null } = {}) {
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
    profile: profileFormat === "alias"
      ? `|| ${profilePrefix} Citi 2 ||`
      : `${profilePrefix} - ${index === 1 ? "William's amex" : "William Chase"}`,
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
          findMany: async ({ where }) => where?.username
            ? (profileUser ? [profileUser] : [])
            : [{ id: "buyer-1", username: "registered-buyer", discordId: "registered-discord-id" }],
          findUnique: async ({ where }) => where.discordId === "registered-discord-id" && registered
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
      parseUsernameFromProfile: (profile) => {
        const normalized = profile.replace(/^\|\|+|\|\|+$/g, "").trim();
        const separator = normalized.indexOf(" - ");
        return separator > 0 ? normalized.slice(0, separator).trim() : null;
      },
      normalizeProfileName: (profile) => profile.replace(/^\|\|+|\|\|+$/g, "").trim(),
      resolveDiscordUsername: async () => registered || discordMember ? { discordId: "registered-discord-id" } : null,
      resolveDiscordDisplayName: async () => displayName,
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

async function loadUserCheckoutSummary() {
  const message = {
    messageId: "raw-success-1",
    occurredAt: new Date("2026-10-16T07:27:26.298Z"),
    profile: "|| girishsekar8392 Citi 2 ||",
    item,
    quantity: "2",
    price: 139.98,
    retailer: "Target",
    imageUrl: null,
    mentionedUser: null,
  };
  const mocks = {
    "@chudaco/db": {
      prisma: {
        checkout: { findMany: async () => [] },
        acoAccount: { findMany: async () => [] },
        user: { findUnique: async () => ({ username: "girishsekar8392" }) },
      },
    },
    "next/server": { NextResponse: { json: (data) => data } },
    "@/lib/api-auth": {
      getAuthenticatedContext: async () => ({
        discordId: "yeeming-discord-id",
        discordUsername: "FroakieFlick",
        userId: "website-user-id",
      }),
    },
    "@/lib/discord-success": {
      fetchDiscordSuccessMessages: async () => ({ messages: [message], scanned: 1, error: null }),
      parseUsernameFromProfile: (profile) => {
        const normalized = profile.replace(/^\|\|+|\|\|+$/g, "").trim();
        const separator = normalized.indexOf(" - ");
        return separator > 0 ? normalized.slice(0, separator).trim() : null;
      },
      normalizeProfileName: (profile) => profile.replace(/^\|\|+|\|\|+$/g, "").trim(),
      resolveDiscordUsername: async () => null,
    },
  };
  const filename = path.join(__dirname, "../app/api/checkouts/route.ts");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = { exports: {}, require: (name) => mocks[name] ?? require(name), Date };
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

test("attributes profile-name matches to Discord users without website accounts", async () => {
  const summary = await summarize({ discordMember: true, checkouts: false });
  assert.equal(summary.topBuyers[0].userId, "discord:registered-discord-id");
  assert.equal(summary.topBuyers[0].username, "yeeming");
  assert.equal(summary.topBuyers[0].count, 3);
  assert.ok(summary.reconciliation.gaps.every((gap) => gap.resolved));
});

test("matches admin profile prefixes directly to website users", async () => {
  const summary = await summarize({
    profilePrefix: "justryen_",
    profileFormat: "alias",
    profileUser: { id: "ryen-user-id", username: "justryen_", discordId: "ryen-discord-id" },
    checkouts: false,
  });
  assert.equal(summary.topBuyers[0].userId, "ryen-user-id");
  assert.equal(summary.topBuyers[0].count, 3);
  assert.ok(summary.reconciliation.gaps.every((gap) => gap.resolved));
});

test("includes raw success_dev checkouts in a user's recap without database records", async () => {
  const response = await loadUserCheckoutSummary();
  assert.equal(response.data.length, 0);
  assert.equal(response.summarySuccesses.length, 1);
  assert.equal(response.summarySuccesses[0].id, "raw-success-1");
  assert.equal(response.summarySuccesses[0].status, "success");
  assert.equal(response.summarySuccesses[0].userId, "website-user-id");
  assert.equal(response.summarySuccesses[0].retailer, "Target");
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

async function fetchConfiguredSuccessMessages() {
  const filename = path.join(__dirname, "discord-success.ts");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const requestedUrls = [];
  const primaryMessages = [
    {
      id: "dev-itemless",
      timestamp: from.toISOString(),
      embeds: [{
        title: "Successful Checkout!",
        fields: [
          { name: "Site", value: "Target" },
          { name: "Profile", value: "|| justryen_ - Freedom 2 ||" },
          { name: "Quantity", value: "1" },
        ],
      }],
    },
    {
      id: "dev-zero-price",
      timestamp: new Date(from.getTime() + 1000).toISOString(),
      embeds: [{
        title: "Checked Out! :tada:",
        fields: [
          { name: "Site", value: "Target" },
          { name: "Product", value: "[(1012850570) ](https://www.target.com/p/-/-/A-1012850570)" },
          { name: "Price", value: "0.00" },
          { name: "Quantity", value: "1" },
          { name: "Profile", value: "|| girishsekar8392 - Target #1 ||" },
        ],
      }],
    },
  ];
  const legacyMessages = [
    {
      id: "legacy-item-details",
      timestamp: new Date(from.getTime() + 500).toISOString(),
      embeds: [{
        title: "Successful Checkout",
        fields: [
          { name: "Profile Name", value: "|| justryen_ - Freedom 2 ||" },
          { name: "Item", value: "Pokémon Trading Card Game: Mega Evolution Delta Reign Elite Trainer Box" },
          { name: "Price", value: "" },
          { name: "Quantity", value: "1" },
        ],
      }],
    },
    {
      id: "legacy-day-price",
      timestamp: new Date(from.getTime() + 1300).toISOString(),
      embeds: [{
        title: "Successful Checkout",
        fields: [
          { name: "Profile Name", value: "|| girishsekar8392 - Target #1 ||" },
          { name: "Item", value: "Pokémon Trading Card Game: 30th Celebration Ultra-Premium Collection- Day" },
          { name: "Price", value: "249.99" },
          { name: "Quantity", value: "1" },
        ],
      }],
    },
  ];
  const context = {
    exports: {},
    require: (name) => name === "./known-item-pricing" ? loadKnownItemPricing() : require(name),
    setTimeout,
    process: { env: {
      DISCORD_BOT_TOKEN: "test-token",
      DISCORD_SUCCESS_DEV_CHANNEL_ID: "success-dev-id",
      DISCORD_SUCCESS_CHANNEL_ID: "success-id",
    } },
    fetch: async (url) => {
      requestedUrls.push(url);
      if (url.includes("channels/success-dev-id/")) {
        if (requestedUrls.filter((requestedUrl) => requestedUrl.includes("channels/success-dev-id/")).length === 1) {
          return {
            ok: false,
            status: 429,
            headers: { get: () => null },
            json: async () => ({ retry_after: 0.01 }),
          };
        }
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => primaryMessages };
      }
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => legacyMessages };
    },
  };
  vm.runInNewContext(source, context, { filename });
  const result = await context.exports.fetchDiscordSuccessMessages(from, to);
  const cachedResult = await context.exports.fetchDiscordSuccessMessages(from, to);
  return { requestedUrls, result, cachedResult, requestCount: requestedUrls.length };
}

function parseSuccessMessage(message) {
  const filename = path.join(__dirname, "discord-success.ts");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = {
    exports: {},
    require: (name) => name === "./known-item-pricing" ? loadKnownItemPricing() : require(name),
  };
  vm.runInNewContext(source, context, { filename });
  return context.exports.parseSuccessEmbed(message);
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

test("reads successful checkout messages from success_dev before the legacy channel", async () => {
  const { requestedUrls, result, cachedResult, requestCount } = await fetchConfiguredSuccessMessages();
  assert.match(requestedUrls[0], /channels\/success-dev-id\/messages/);
  assert.match(requestedUrls[1], /channels\/success-dev-id\/messages/);
  assert.match(requestedUrls[2], /channels\/success-id\/messages/);
  assert.equal(result.error, null);
  assert.equal(result.scanned, 4);
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].messageId, "dev-itemless");
  assert.equal(result.messages[0].item, "Pokémon Trading Card Game: Mega Evolution Delta Reign Elite Trainer Box");
  assert.equal(result.messages[0].price, 59.99);
  assert.equal(result.messages[1].messageId, "dev-zero-price");
  assert.equal(result.messages[1].item, "Pokémon Trading Card Game: 30th Celebration Ultra-Premium Collection- Day");
  assert.equal(result.messages[1].price, 249.99);
  assert.equal(cachedResult.messages.length, 2);
  assert.equal(requestCount, 3);
});

test("parses raw Checked Out webhook field names from success_dev", () => {
  const parsed = parseSuccessMessage({
    id: "raw-checkout",
    timestamp: "2026-11-06T10:00:00.000Z",
    embeds: [{
      title: "Checked Out! :tada:",
      fields: [
        { name: "Site", value: "Target" },
        { name: "Product", value: "Trading Card Booster Display" },
        { name: "Price", value: "179.99" },
        { name: "Quantity", value: "1" },
        { name: "Profile", value: "|| justryen_ - Freedom 2 ||" },
      ],
    }],
  });

  assert.equal(parsed.profile, "justryen_ - Freedom 2");
  assert.equal(parsed.item, "Trading Card Booster Display");
  assert.equal(parsed.quantity, "1");
  assert.equal(parsed.price, 179.99);
  assert.equal(parsed.retailer, "Target");
});

test("normalizes Target product-ID-only embeds to priced Day and Ditto names", () => {
  const parseTargetItem = (product) => parseSuccessMessage({
    id: "target-product-id",
    timestamp: "2026-11-06T10:00:00.000Z",
    embeds: [{
      title: "Checked Out! :tada:",
      fields: [
        { name: "Site", value: "Target" },
        { name: "Product", value: product },
        { name: "Price", value: "0.00" },
        { name: "Quantity", value: "1" },
        { name: "Profile", value: "|| buyer - Target ||" },
      ],
    }],
  });

  const day = parseTargetItem("[(1012850570) ](https://www.target.com/p/-/-/A-1012850570)");
  const ditto = parseTargetItem("[(1012663804) ](https://www.target.com/p/-/-/A-1012663804)");
  assert.equal(day.item, "Pokémon Trading Card Game: 30th Celebration Ultra-Premium Collection- Day");
  assert.equal(ditto.item, "Pokémon Trading Card Game: 30th Celebration Ditto Premium Collection");
  assert.equal(day.price, null);
  assert.equal(ditto.price, null);
});

test("normalizes the Target Delta Reign ETB ID to the same product name", () => {
  const parsed = parseSuccessMessage({
    id: "target-etb-id",
    timestamp: "2026-11-06T10:00:00.000Z",
    embeds: [{
      title: "Checked Out! :tada:",
      fields: [
        { name: "Product", value: "[(1012793604) Pokémon Trading Card Game: Mega Evolution— Delta Reign Elite Trainer Box](https://www.target.com/p/-/-/A-1012793604)" },
        { name: "Price", value: "0.00" },
        { name: "Quantity", value: "1" },
        { name: "Profile", value: "|| buyer - Target ||" },
      ],
    }],
  });

  assert.equal(parsed.item, "Pokémon Trading Card Game: Mega Evolution— Delta Reign Elite Trainer Box");
  assert.equal(loadPricing().resolveDropSummaryOrderPrice(parsed.item, "Target", 1, []), 59.99);
});

test("backfills known Target Day and Ditto prices from product IDs", () => {
  const pricing = loadPricing();
  assert.equal(pricing.resolveDropSummaryOrderPrice("1012850570", "Target", 1, []), 249.99);
  assert.equal(pricing.resolveDropSummaryOrderPrice("1012663804", "Target", 1, []), 49.99);
  assert.equal(pricing.resolveDropSummaryOrderPrice("1012850570", "Target", 2, []), 499.98);
  assert.equal(pricing.resolveDropSummaryOrderPrice("1012663804", "Target", 2, []), 99.98);
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