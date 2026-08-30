var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// hayha-success-test.js
var hayha_success_test_default = {
  async fetch(request, env) {
    try {
      if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS")
        return ok("alive");
      if (request.method !== "POST")
        return ok("ignored");
      if (env.RELAY_SECRET) {
        const secret = request.headers.get("x-relay-secret") || "";
        if (secret !== env.RELAY_SECRET)
          return ok("accepted");
      }
      const body = await parseBody(request);
      if (isTest(body)) {
        const s2 = buildTestCheckoutPayload();
        const mentionUserId2 = await resolveMentionId(env, s2.profile);
        console.log("test mentionUserId", mentionUserId2 || "none");
        await Promise.all([
          post(env.DISCORD_WEBHOOK_URL, testPayload("ChudACO Success", false, mentionUserId2)),
          postToChudaco(env, s2)
        ]);
        return ok("test");
      }
      if (!isHayhaSuccess(body))
        return ok("not success");
      const s = sanitize(body);
      const mentionUserId = await resolveMentionId(env, s.profile);
      console.log("success mentionUserId", mentionUserId || "none", "profile", s.profile);
      await Promise.all([
        post(env.DISCORD_WEBHOOK_URL, successPayload("ChudACO Success", s, mentionUserId)),
        postToChudaco(env, s)
      ]);
      return ok("forwarded");
    } catch (e) {
      console.log("error", String(e));
      return ok("caught");
    }
  }
};
function ok(msg) {
  return new Response(msg, { status: 200 });
}
__name(ok, "ok");
async function parseBody(request) {
  const raw = await request.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { message: raw || "" };
  }
}
__name(parseBody, "parseBody");
function blob(b) {
  return [b?.title, b?.message, b?.content, b?.status, b?.event, b?.type, b?.result, b?.embeds?.[0]?.title, b?.embeds?.[0]?.description].filter(Boolean).map((v) => String(v).toLowerCase()).join(" ");
}
__name(blob, "blob");
function isTest(b) {
  return /test webhook|testing|webhook test|ping/.test(blob(b));
}
__name(isTest, "isTest");
function isHayhaSuccess(b) {
  return /successful checkout|way to go|checked out|checkout success|\bsuccess\b/.test(blob(b));
}
__name(isHayhaSuccess, "isHayhaSuccess");
function buildTestCheckoutPayload() {
  return {
    profile: "girishsekar8392 - ACO #1",
    site: "test-site",
    mode: "test-mode",
    item: "Test Item Name",
    quantity: "1",
    price: "$59.99",
    size: "N/A",
    color: "N/A",
    image: "https://target.scene7.com/is/image/Target/GUEST_40ed4d44-2adc-4cfe-a27b-0ce8b6e73cba?wid=1200&hei=1200&qlt=80"
  };
}
__name(buildTestCheckoutPayload, "buildTestCheckoutPayload");
function fieldsMap(b) {
  const m = {};
  const arr = b?.embeds?.[0]?.fields;
  if (!Array.isArray(arr))
    return m;
  for (const f of arr)
    m[String(f?.name || "").trim().toLowerCase()] = String(f?.value || "").trim();
  return m;
}
__name(fieldsMap, "fieldsMap");
function pick(b, m, directKeys, fieldKeys, fallback) {
  for (const k of directKeys)
    if (b?.[k] != null && String(b[k]).trim() !== "")
      return String(b[k]).trim();
  for (const k of fieldKeys)
    if (m[k] && m[k].trim() !== "")
      return m[k].trim();
  return fallback;
}
__name(pick, "pick");
function priceOf(v) {
  const s = String(v || "");
  const m = s.match(/\$[0-9][0-9,]*(\.[0-9]{2})?/);
  return m ? m[0] : "unknown";
}
__name(priceOf, "priceOf");
function imageOf(b) {
  const c = [b?.image, b?.imageUrl, b?.productImage, b?.embeds?.[0]?.thumbnail?.url, b?.embeds?.[0]?.image?.url, b?.attachments?.[0]?.url];
  for (const v of c)
    if (/^https?:\/\/\S+$/i.test(String(v || "").trim()))
      return String(v).trim();
  return "";
}
__name(imageOf, "imageOf");
function sanitize(b) {
  const m = fieldsMap(b);
  const item = pick(b, m, ["item", "product", "title"], ["item", "product"], "unknown");
  const qtyRaw = pick(b, m, ["quantity", "qty"], ["quantity"], "0");
  const qty = Number.isFinite(parseInt(qtyRaw, 10)) ? String(parseInt(qtyRaw, 10)) : "0";
  return {
    profile: pick(b, m, ["profileName", "profile_name", "profile"], ["profile name", "profile"], "unknown"),
    site: pick(b, m, ["site", "store", "domain"], ["site"], "unknown"),
    mode: pick(b, m, ["mode"], ["mode"], "unknown"),
    item,
    quantity: qty,
    price: pick(b, m, ["price"], ["price"], priceOf(item)),
    size: pick(b, m, ["size"], ["size"], "N/A"),
    color: pick(b, m, ["color"], ["color"], "N/A"),
    image: imageOf(b)
  };
}
__name(sanitize, "sanitize");
function successPayload(name, s, mentionUserId) {
  const embed = {
    title: "Successful Checkout",
    color: 5763719,
    fields: [
      { name: "Profile Name", value: s.profile, inline: true },
      { name: "Mode", value: s.mode, inline: true },
      { name: "Quantity", value: s.quantity, inline: true },
      { name: "Price", value: s.price, inline: true },
      { name: "Item", value: s.item, inline: false }
    ],
    footer: { text: "ChudACO" },
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (s.image)
    embed.thumbnail = { url: s.image };
  return {
    username: name,
    // Mentions only actually notify someone from the content field —
    // text inside embeds renders as a styled mention but never pings.
    content: mentionUserId ? `<@${mentionUserId}>` : "",
    // Stays locked down by default (no @everyone/@here/role pings ever
    // possible from this worker), and only ever opens up for the one
    // specific, verified user ID resolved for this exact message —
    // never a blanket allowance.
    allowed_mentions: mentionUserId ? { parse: [], users: [mentionUserId] } : { parse: [] },
    embeds: [embed]
  };
}
__name(successPayload, "successPayload");
function testPayload(name, isDecline, mentionUserId) {
  return {
    username: name,
    content: mentionUserId ? `<@${mentionUserId}>` : "",
    allowed_mentions: mentionUserId ? { parse: [], users: [mentionUserId] } : { parse: [] },
    embeds: [{
      title: isDecline ? "Payment Declined (Test)" : "Successful Checkout (Test)",
      color: isDecline ? 15105570 : 5763719,
      fields: [
        { name: "Profile Name", value: "girishsekar8392 - ACO #1", inline: true },
        { name: "Mode", value: "test-mode", inline: true },
        { name: "Quantity", value: "1", inline: true },
        { name: "Price", value: "$59.99", inline: true },
        { name: "Item", value: "Test Item Name", inline: false }
      ],
      thumbnail: { url: "https://target.scene7.com/is/image/Target/GUEST_40ed4d44-2adc-4cfe-a27b-0ce8b6e73cba?wid=1200&hei=1200&qlt=80" },
      footer: { text: "ChudACO" },
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }]
  };
}
__name(testPayload, "testPayload");
async function post(url, payload) {
  if (!url)
    return;
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (!r.ok)
      console.log("discord", r.status, await r.text());
  } catch (e) {
    console.log("discord error", String(e));
  }
}
__name(post, "post");
async function postToChudaco(env, s) {
  if (!env.CHUDACO_INGEST_URL)
    return;
  try {
    const r = await fetch(env.CHUDACO_INGEST_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-api-key": env.INTERNAL_API_KEY || ""
      },
      body: JSON.stringify(s)
    });
    if (!r.ok)
      console.log("chudaco ingest", r.status, await r.text());
  } catch (e) {
    console.log("chudaco ingest error", String(e));
  }
}
__name(postToChudaco, "postToChudaco");
function parseUsernameFromProfile(profile) {
  if (!profile || typeof profile !== "string")
    return null;
  const idx = profile.indexOf(" - ");
  if (idx <= 0)
    return null;
  const username = profile.slice(0, idx).trim();
  if (!username)
    return null;
  return username;
}
__name(parseUsernameFromProfile, "parseUsernameFromProfile");
async function resolveMentionId(env, profile) {
  const username = parseUsernameFromProfile(profile);
  if (!username)
    return null;
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID)
    return null;
  try {
    const url = `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/search?query=${encodeURIComponent(username)}&limit=10`;
    const r = await fetch(url, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
    if (!r.ok) {
      console.log("member search failed", r.status, await r.text());
      return null;
    }
    const results = await r.json();
    const target = username.toLowerCase();
    const match = Array.isArray(results) ? results.find((m) => {
      const usernameCandidate = String(m?.user?.username || "").toLowerCase();
      const globalNameCandidate = String(m?.user?.global_name || "").toLowerCase();
      const nickCandidate = String(m?.nick || "").toLowerCase();
      return usernameCandidate === target || globalNameCandidate === target || nickCandidate === target;
    }) : null;
    if (!match?.user?.id)
      return null;
    return String(match.user.id);
  } catch (e) {
    console.log("member search error", String(e));
    return null;
  }
}
__name(resolveMentionId, "resolveMentionId");

// ../../../../Library/Caches/pnpm/dlx/mkjuaounm4nakdbzwehbcpnyiu/1a0317a7eeb-294e/node_modules/.pnpm/wrangler@3.114.0/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../Library/Caches/pnpm/dlx/mkjuaounm4nakdbzwehbcpnyiu/1a0317a7eeb-294e/node_modules/.pnpm/wrangler@3.114.0/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-SWiFkC/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = hayha_success_test_default;

// ../../../../Library/Caches/pnpm/dlx/mkjuaounm4nakdbzwehbcpnyiu/1a0317a7eeb-294e/node_modules/.pnpm/wrangler@3.114.0/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-SWiFkC/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=hayha-success-test.js.map
