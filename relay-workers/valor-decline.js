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
        await post(env.DISCORD_VALOR_WEBHOOK_DECLINE, testPayload("ChudACO Declines", true));
        return ok("test");
      }

      const kind = valorDeclineKind(body);
      if (kind === "other") return ok("not decline");

      const s = sanitize(body);
      const reason = extractReason(body, kind);
      await post(env.DISCORD_VALOR_WEBHOOK_DECLINE, declinePayload("ChudACO Declines", s, reason, kind));
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
function valorDeclineKind(b) {
  const t = blob(b);
  if (/payment declined|card declined|\bdeclined\b/.test(t)) return "declined";
  if (/checkout failed|payment failed|\bfailed\b|failure|cancelled|canceled/.test(t)) return "failed";
  return "other";
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
  const item = pick(b, m, ["item", "product", "title"], ["product", "item"], "unknown");
  const qtyRaw = pick(b, m, ["quantity", "qty"], ["quantity"], "0");
  const qty = Number.isFinite(parseInt(qtyRaw, 10)) ? String(parseInt(qtyRaw, 10)) : "0";
  return {
    profile: pick(b, m, ["profileName", "profile_name", "profile"], ["profile", "profile name"], "unknown"),
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
function extractReason(b, kind) {
  const m = fieldsMap(b);
  return pick(
    b,
    m,
    ["reason", "error", "failureReason", "declineReason"],
    ["reason", "status"],
    kind === "declined" ? "Payment declined" : "Checkout failed"
  );
}
function declinePayload(name, s, reason, kind) {
  const embed = {
    title: kind === "declined" ? "Payment Declined" : "Checkout Failed",
    color: kind === "declined" ? 15105570 : 15548997,
    fields: [
      { name: "Profile Name", value: s.profile, inline: true },
      // { name: "Site", value: s.site, inline: true },
      { name: "Mode", value: s.mode, inline: true },
      { name: "Quantity", value: s.quantity, inline: true },
      { name: "Price", value: s.price, inline: true },
      // { name: "Size", value: s.size, inline: true },
      // { name: "Color", value: s.color, inline: true },
      { name: "Item", value: s.item, inline: false },
      { name: "Reason", value: reason, inline: false }
    ],
    footer: { text: "ChudACO" },
    timestamp: new Date().toISOString()
  };
  if (s.image) embed.thumbnail = { url: s.image };
  return { username: name, content: "", allowed_mentions: { parse: [] }, embeds: [embed] };
}
function testPayload(name, isDecline) {
  return {
    username: name,
    content: "",
    allowed_mentions: { parse: [] },
    embeds: [{
      title: isDecline ? "Payment Declined (Test)" : "Successful Checkout (Test)",
      color: isDecline ? 15105570 : 5763719,
      fields: [
        { name: "Profile Name", value: "test-profile", inline: true },
        // { name: "Site", value: "test-site", inline: true },
        { name: "Mode", value: "test-mode", inline: true },
        { name: "Quantity", value: "1", inline: true },
        { name: "Price", value: "$19.99", inline: true },
        // { name: "Size", value: "N/A", inline: true },
        // { name: "Color", value: "N/A", inline: true },
        { name: "Item", value: "Test Item Name", inline: false },
        { name: "Reason", value: "Testing failure webhook", inline: false }
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