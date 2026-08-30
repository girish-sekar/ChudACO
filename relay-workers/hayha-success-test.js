export default {
  async fetch(request, env) {
    try {
      if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return ok("alive");
      if (request.method !== "POST") return ok("ignored");

      if (env.RELAY_SECRET) {
        const secret = request.headers.get("x-relay-secret") || "";
        if (secret !== env.RELAY_SECRET) return ok("accepted");
      }

      const body = await parseBody(request);

      if (isTest(body)) {
        const s = buildTestCheckoutPayload();
        const mentionUserId = await resolveMentionId(env, s.profile);
        console.log("test mentionUserId", mentionUserId || "none");
        await Promise.all([
          post(env.DISCORD_WEBHOOK_URL, testPayload("ChudACO Success", false, mentionUserId)),
          postToChudaco(env, s)
        ]);
        return ok("test");
      }

      if (!isHayhaSuccess(body)) return ok("not success");

      const s = sanitize(body);

      // Resolving the mention happens BEFORE the Discord post, since the
      // mention (if any) needs to be baked into that payload's content
      // field. It's wrapped so any failure here — bad format, API error,
      // no match — degrades to "no mention" rather than blocking the
      // notification itself.
      const mentionUserId = await resolveMentionId(env, s.profile);
      console.log("success mentionUserId", mentionUserId || "none", "profile", s.profile);

      // Fire both forwards in parallel — a slow or down ChudACO app must
      // never delay or block the existing, working Discord notification.
      // post() already swallows its own errors internally, so a failure
      // in either one can't throw and break the other.
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

function ok(msg) { return new Response(msg, { status: 200 }); }
async function parseBody(request) {
  const raw = await request.text();
  try { return raw ? JSON.parse(raw) : {}; } catch { return { message: raw || "" }; }
}
function blob(b) {
  return [b?.title, b?.message, b?.content, b?.status, b?.event, b?.type, b?.result, b?.embeds?.[0]?.title, b?.embeds?.[0]?.description]
    .filter(Boolean).map(v => String(v).toLowerCase()).join(" ");
}
function isTest(b) { return /test webhook|testing|webhook test|ping/.test(blob(b)); }
function isHayhaSuccess(b) { return /successful checkout|way to go|checked out|checkout success|\bsuccess\b/.test(blob(b)); }

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

function fieldsMap(b) {
  const m = {};
  const arr = b?.embeds?.[0]?.fields;
  if (!Array.isArray(arr)) return m;
  for (const f of arr) m[String(f?.name || "").trim().toLowerCase()] = String(f?.value || "").trim();
  return m;
}
function pick(b, m, directKeys, fieldKeys, fallback) {
  for (const k of directKeys) if (b?.[k] != null && String(b[k]).trim() !== "") return String(b[k]).trim();
  for (const k of fieldKeys) if (m[k] && m[k].trim() !== "") return m[k].trim();
  return fallback;
}
function priceOf(v) {
  const s = String(v || "");
  const m = s.match(/\$[0-9][0-9,]*(\.[0-9]{2})?/);
  return m ? m[0] : "unknown";
}
function imageOf(b) {
  const c = [b?.image, b?.imageUrl, b?.productImage, b?.embeds?.[0]?.thumbnail?.url, b?.embeds?.[0]?.image?.url, b?.attachments?.[0]?.url];
  for (const v of c) if (/^https?:\/\/\S+$/i.test(String(v || "").trim())) return String(v).trim();
  return "";
}
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
    timestamp: new Date().toISOString()
  };
  if (s.image) embed.thumbnail = { url: s.image };
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
      timestamp: new Date().toISOString()
    }]
  };
}
async function post(url, payload) {
  if (!url) return;
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (!r.ok) console.log("discord", r.status, await r.text());
  } catch (e) { console.log("discord error", String(e)); }
}
async function postToChudaco(env, s) {
  if (!env.CHUDACO_INGEST_URL) return;
  try {
    const r = await fetch(env.CHUDACO_INGEST_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-api-key": env.INTERNAL_API_KEY || ""
      },
      body: JSON.stringify(s)
    });
    if (!r.ok) console.log("chudaco ingest", r.status, await r.text());
  } catch (e) { console.log("chudaco ingest error", String(e)); }
}

// Pulls the Discord username segment out of "{username} - {label}".
// Returns null on anything that doesn't look like the expected format —
// that's the signal to skip the mention entirely, not throw.
function parseUsernameFromProfile(profile) {
  if (!profile || typeof profile !== "string") return null;
  const idx = profile.indexOf(" - ");
  if (idx <= 0) return null;
  const username = profile.slice(0, idx).trim();
  if (!username) return null;
  return username;
}

// Resolves a Discord username to a user ID via the bot API, with an
// optional KV cache (bind a KV namespace as MENTION_CACHE in the Worker's
// settings to enable it — entirely optional, everything below degrades
// gracefully to a live lookup every time if it's not bound). Returns null
// on ANY failure or ambiguity — malformed profile string, API error, no
// exact match found. Never throws.
async function resolveMentionId(env, profile) {
  const username = parseUsernameFromProfile(profile);
  if (!username) return null;
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return null;

  try {
    const url = `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/search?query=${encodeURIComponent(username)}&limit=10`;
    const r = await fetch(url, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
    if (!r.ok) {
      console.log("member search failed", r.status, await r.text());
      return null;
    }

    const results = await r.json();
    const target = username.toLowerCase();
    const match = Array.isArray(results)
      ? results.find((m) => {
          const usernameCandidate = String(m?.user?.username || "").toLowerCase();
          const globalNameCandidate = String(m?.user?.global_name || "").toLowerCase();
          const nickCandidate = String(m?.nick || "").toLowerCase();
          return (
            usernameCandidate === target ||
            globalNameCandidate === target ||
            nickCandidate === target
          );
        })
      : null;

    if (!match?.user?.id) return null;
    return String(match.user.id);
  } catch (e) {
    console.log("member search error", String(e));
    return null;
  }
}