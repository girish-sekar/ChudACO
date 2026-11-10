import { ascendedHeroesTechStickerUnitPrice, normalizeKnownItemName } from "./known-item-pricing";

const DISCORD_EPOCH = 1420070400000n;

function snowflakeFromDate(date: Date): string {
  const ms = BigInt(date.getTime()) - DISCORD_EPOCH;
  return ((ms < 0n ? 0n : ms) << 22n).toString();
}

// Mirrors normalizeProfileName() in api/internal/checkouts so lookups match the same key.
function normalizeProfileName(profile: string): string {
  return profile.trim().replace(/^\|\|+|\|\|+$/g, "").trim();
}

// Profile Name embed field is "{discordUsername} - {accountLabel}"; pulls out the username segment.
function parseUsernameFromProfile(profile: string): string | null {
  const normalized = normalizeProfileName(profile);
  const idx = normalized.indexOf(" - ");
  if (idx <= 0) {
    return null;
  }
  const username = normalized.slice(0, idx).trim();
  return username.length > 0 ? username : null;
}

function parsePriceToNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function knownEtbUnitPrice(item: string): number | null {
  if (/30th celebration.*elite trainer box|elite trainer box.*30th celebration/i.test(item)) {
    return 69.99;
  }
  if (/delta reign.*elite trainer box|elite trainer box.*delta reign/i.test(item)) {
    return 59.99;
  }
  return null;
}

type DiscordEmbedField = { name?: string; value?: string };
type DiscordEmbed = {
  title?: string;
  fields?: DiscordEmbedField[];
  thumbnail?: { url?: string };
  image?: { url?: string };
};
type DiscordMention = { id: string; username?: string; global_name?: string | null };
type DiscordMessage = { id: string; timestamp: string; embeds?: DiscordEmbed[]; mentions?: DiscordMention[] };

export type ParsedSuccessMessage = {
  messageId: string;
  occurredAt: Date;
  profile: string;
  item: string;
  quantity: string;
  price: number | null;
  retailer: string | null;
  imageUrl: string | null;
  mentionedUser: { id: string; username: string | null; displayName: string | null } | null;
};

type SuccessFetchResult = { messages: ParsedSuccessMessage[]; scanned: number; error: string | null };

const SUCCESS_CACHE_TTL_MS = 30_000;
const MAX_RATE_LIMIT_RETRIES = 2;
const CHANNEL_MATCH_WINDOW_MS = 10 * 60 * 1000;
const successMessageCache = new Map<string, { expiresAt: number; result: SuccessFetchResult }>();
const successMessageRequests = new Map<string, Promise<SuccessFetchResult>>();

function fieldsMap(embed: DiscordEmbed): Map<string, string> {
  const map = new Map<string, string>();
  for (const field of embed.fields ?? []) {
    map.set(String(field.name ?? "").trim().toLowerCase(), String(field.value ?? "").trim());
  }
  return map;
}

export function parseSuccessEmbed(message: DiscordMessage): ParsedSuccessMessage | null {
  const embed = message.embeds?.find((candidate) => /^(?:successful checkout|checked out)\b/i.test(candidate.title ?? ""));
  if (!embed) {
    return null;
  }

  const fields = fieldsMap(embed);
  const profile = fields.get("profile name") ?? fields.get("profile");
  const rawItem = fields.get("item") ?? fields.get("product");
  const item = rawItem ? normalizeKnownItemName(rawItem) : "";
  const rawImageUrl = embed.thumbnail?.url ?? embed.image?.url ?? null;
  const imageUrl = rawImageUrl && /^https?:\/\//i.test(rawImageUrl) ? rawImageUrl : null;
  const priceRaw = fields.get("price");
  const parsedPrice = priceRaw ? parsePriceToNumber(priceRaw) : null;
  const retailer = fields.get("retailer") ?? fields.get("site") ?? fields.get("website") ?? null;
  const quantity = fields.get("quantity") ?? fields.get("qty") ?? "0";
  const parsedQuantity = Number.parseInt(quantity, 10);
  const itemQuantity = Number.isSafeInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;
  const unitPrice = item ? knownEtbUnitPrice(item) ?? ascendedHeroesTechStickerUnitPrice(item) : null;
  const price = parsedPrice ?? (unitPrice === null ? null : unitPrice * itemQuantity);

  if (!profile) {
    return null;
  }

  const profileUsername = parseUsernameFromProfile(profile)?.toLowerCase();
  const mentions = message.mentions ?? [];
  const mentionedUser = mentions.find((user) =>
    [user.username, user.global_name].some((name) => name?.trim().toLowerCase() === profileUsername),
  ) ?? null;

  return {
    messageId: message.id,
    occurredAt: new Date(message.timestamp),
    profile: normalizeProfileName(profile),
    item,
    quantity,
    price,
    retailer,
    imageUrl,
    mentionedUser: mentionedUser
      ? {
          id: mentionedUser.id,
          username: mentionedUser.username?.trim() || null,
          displayName: mentionedUser.global_name?.trim() || mentionedUser.username?.trim() || null,
        }
      : null,
  };
}

const MAX_PAGES = 20;
const PAGE_SIZE = 100;

async function fetchChannelSuccessMessages(
  from: Date,
  to: Date,
  channelId: string,
  token: string,
): Promise<SuccessFetchResult> {
  const results: ParsedSuccessMessage[] = [];
  let before = snowflakeFromDate(new Date(to.getTime() + 1000));
  let scanned = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=${PAGE_SIZE}&before=${before}`;
    let response: Response | null = null;
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
      response = await fetch(url, {
        headers: { Authorization: `Bot ${token}` },
        cache: "no-store",
      });
      if (response.status !== 429) break;

      const payload = await response.json().catch(() => null) as { retry_after?: number } | null;
      if (attempt === MAX_RATE_LIMIT_RETRIES) break;
      const headerRetryAfter = Number(response.headers.get("retry-after"));
      const retryAfter = Number(payload?.retry_after ?? headerRetryAfter);
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.ceil(retryAfter * 1000) + 100
        : 1100;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    if (!response?.ok) {
      return { messages: results, scanned, error: `discord_api_${response?.status ?? "unknown"}` };
    }

    const batch = (await response.json()) as DiscordMessage[];
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    scanned += batch.length;

    for (const message of batch) {
      const timestamp = new Date(message.timestamp);
      if (timestamp < from || timestamp > to) continue;
      const parsed = parseSuccessEmbed(message);
      if (parsed) results.push(parsed);
    }

    const oldest = batch[batch.length - 1];
    const oldestTimestamp = new Date(oldest.timestamp);
    if (oldestTimestamp < from || batch.length < PAGE_SIZE) break;
    before = oldest.id;
  }

  return { messages: results, scanned, error: null };
}

function comparableItem(item: string): string {
  return normalizeKnownItemName(item)
    .replace(/^\[([\s\S]+)\]\(https?:\/\/[^)]+\)$/i, "$1")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/^\(?\d+\)?\s*/, "")
    .trim()
    .toLowerCase();
}

function enrichPrimaryMessages(
  primary: ParsedSuccessMessage[],
  legacy: ParsedSuccessMessage[],
): ParsedSuccessMessage[] {
  const usedLegacyMessages = new Set<string>();

  return primary.map((message) => {
    if (message.item && message.price !== null && message.price > 0) return message;

    const profile = normalizeProfileName(message.profile).toLowerCase();
    const match = legacy
      .filter((candidate) => {
        if (usedLegacyMessages.has(candidate.messageId)) return false;
        if (normalizeProfileName(candidate.profile).toLowerCase() !== profile) return false;
        if (Math.abs(candidate.occurredAt.getTime() - message.occurredAt.getTime()) > CHANNEL_MATCH_WINDOW_MS) return false;
        return !message.item || !candidate.item || comparableItem(message.item) === comparableItem(candidate.item);
      })
      .sort((first, second) =>
        Math.abs(first.occurredAt.getTime() - message.occurredAt.getTime())
        - Math.abs(second.occurredAt.getTime() - message.occurredAt.getTime()),
      )[0];

    if (match) usedLegacyMessages.add(match.messageId);
    const item = message.item || match?.item || "(Item unavailable)";
    const price = message.price !== null && message.price > 0
      ? message.price
      : match?.price !== null && match?.price !== undefined && match.price > 0
        ? match.price
        : message.price;

    return {
      ...message,
      item,
      quantity: message.quantity && message.quantity !== "0" ? message.quantity : match?.quantity ?? message.quantity,
      price,
      retailer: message.retailer ?? match?.retailer ?? null,
      imageUrl: message.imageUrl ?? match?.imageUrl ?? null,
      mentionedUser: message.mentionedUser ?? match?.mentionedUser ?? null,
    };
  });
}

// Fetches success-dev as the source of truth; matching legacy messages only fill missing fields.
export async function fetchDiscordSuccessMessages(
  from: Date,
  to: Date,
): Promise<SuccessFetchResult> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const primaryChannelId = process.env.DISCORD_SUCCESS_DEV_CHANNEL_ID?.trim()
    || process.env.DISCORD_SUCCESS_CHANNEL_ID?.trim();
  const legacyChannelId = process.env.DISCORD_SUCCESS_CHANNEL_ID?.trim();

  if (!token || !primaryChannelId) {
    return { messages: [], scanned: 0, error: "not_configured" };
  }

  const cacheKey = `${primaryChannelId}:${legacyChannelId ?? ""}:${from.toISOString()}:${to.toISOString()}`;
  const cached = successMessageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const pending = successMessageRequests.get(cacheKey);
  if (pending) return pending;

  const request = (async (): Promise<SuccessFetchResult> => {
    const primary = await fetchChannelSuccessMessages(from, to, primaryChannelId, token);
    if (primary.error) return primary;

    const needsEnrichment = primary.messages.some((message) => !message.item || message.price === null);
    if (!needsEnrichment || !legacyChannelId || legacyChannelId === primaryChannelId) return primary;

    const legacy = await fetchChannelSuccessMessages(from, to, legacyChannelId, token);
    const messages = enrichPrimaryMessages(primary.messages, legacy.error ? [] : legacy.messages);
    return {
      messages,
      scanned: primary.scanned + (legacy.error ? 0 : legacy.scanned),
      error: null,
    };
  })();

  successMessageRequests.set(cacheKey, request);
  try {
    const result = await request;
    if (!result.error) {
      successMessageCache.set(cacheKey, { expiresAt: Date.now() + SUCCESS_CACHE_TTL_MS, result });
    }
    return result;
  } finally {
    successMessageRequests.delete(cacheKey);
  }
}

export type ResolvedGuildMember = { discordId: string } | null;

export async function resolveDiscordDisplayName(discordId: string): Promise<string | null> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) return null;

  try {
    const response = await fetch(`https://discord.com/api/v10/users/${encodeURIComponent(discordId)}`, {
      headers: { Authorization: `Bot ${token}` },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;

    const user = (await response.json()) as { global_name?: string | null; username?: string };
    return user.global_name?.trim() || user.username?.trim() || null;
  } catch {
    return null;
  }
}

// Resolves a bare Discord username to a guild member's user ID via the bot's member-search API.
export async function resolveDiscordUsername(username: string): Promise<ResolvedGuildMember> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  if (!token || !guildId) {
    return null;
  }

  try {
    const url = `https://discord.com/api/v10/guilds/${guildId}/members/search?query=${encodeURIComponent(username)}&limit=10`;
    const response = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }

    const results = (await response.json()) as Array<{
      user?: { id?: string; username?: string; global_name?: string };
      nick?: string;
    }>;

    const target = username.toLowerCase();
    const match = results.find((member) => {
      const candidate = String(member.user?.username ?? "").toLowerCase();
      const globalName = String(member.user?.global_name ?? "").toLowerCase();
      const nick = String(member.nick ?? "").toLowerCase();
      return candidate === target || globalName === target || nick === target;
    });

    const discordId = match?.user?.id;
    return discordId ? { discordId } : null;
  } catch {
    return null;
  }
}

export { parseUsernameFromProfile, normalizeProfileName };
