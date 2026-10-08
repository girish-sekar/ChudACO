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
type DiscordEmbed = { title?: string; fields?: DiscordEmbedField[] };
type DiscordMessage = { id: string; timestamp: string; embeds?: DiscordEmbed[] };

export type ParsedSuccessMessage = {
  messageId: string;
  occurredAt: Date;
  profile: string;
  item: string;
  quantity: string;
  price: number | null;
};

function fieldsMap(embed: DiscordEmbed): Map<string, string> {
  const map = new Map<string, string>();
  for (const field of embed.fields ?? []) {
    map.set(String(field.name ?? "").trim().toLowerCase(), String(field.value ?? "").trim());
  }
  return map;
}

function parseSuccessEmbed(message: DiscordMessage): ParsedSuccessMessage | null {
  const embed = message.embeds?.find((candidate) => /successful checkout/i.test(candidate.title ?? ""));
  if (!embed) {
    return null;
  }

  const fields = fieldsMap(embed);
  const profile = fields.get("profile name");
  const item = fields.get("item");
  const priceRaw = fields.get("price");
  const parsedPrice = priceRaw ? parsePriceToNumber(priceRaw) : null;
  const quantity = fields.get("quantity") ?? "0";
  const parsedQuantity = Number.parseInt(quantity, 10);
  const itemQuantity = Number.isSafeInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;
  const unitPrice = item ? knownEtbUnitPrice(item) : null;
  const price = parsedPrice ?? (unitPrice === null ? null : unitPrice * itemQuantity);

  if (!profile || !item) {
    return null;
  }

  return {
    messageId: message.id,
    occurredAt: new Date(message.timestamp),
    profile: normalizeProfileName(profile),
    item,
    quantity,
    price,
  };
}

const MAX_PAGES = 20;
const PAGE_SIZE = 100;

// Fetches and parses "Successful Checkout" embeds posted in the configured Discord
// channel within [from, to]. Paginates backwards from `to` until the range is covered.
export async function fetchDiscordSuccessMessages(
  from: Date,
  to: Date,
): Promise<{ messages: ParsedSuccessMessage[]; scanned: number; error: string | null }> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const channelId = process.env.DISCORD_SUCCESS_CHANNEL_ID?.trim();

  if (!token || !channelId) {
    return { messages: [], scanned: 0, error: "not_configured" };
  }

  const results: ParsedSuccessMessage[] = [];
  let before = snowflakeFromDate(new Date(to.getTime() + 1000));
  let scanned = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=${PAGE_SIZE}&before=${before}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        messages: results,
        scanned,
        error: `discord_api_${response.status}`,
      };
    }

    const batch = (await response.json()) as DiscordMessage[];
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    scanned += batch.length;

    for (const message of batch) {
      const timestamp = new Date(message.timestamp);
      if (timestamp < from) {
        continue;
      }
      if (timestamp > to) {
        continue;
      }
      const parsed = parseSuccessEmbed(message);
      if (parsed) {
        results.push(parsed);
      }
    }

    const oldest = batch[batch.length - 1];
    const oldestTimestamp = new Date(oldest.timestamp);
    if (oldestTimestamp < from || batch.length < PAGE_SIZE) {
      break;
    }

    before = oldest.id;
  }

  return { messages: results, scanned, error: null };
}

export type ResolvedGuildMember = { discordId: string } | null;

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
