import "server-only";

export interface PremiumCache {
  get(userId: string): Promise<boolean | undefined>;
  set(userId: string, premium: boolean): Promise<void>;
  delete(userId: string): Promise<void>;
}

class MemoryPremiumCache implements PremiumCache {
  private entries = new Map<string, { premium: boolean; expiresAt: number }>();

  async get(userId: string): Promise<boolean | undefined> {
    const entry = this.entries.get(userId);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(userId);
      return undefined;
    }
    return entry.premium;
  }

  async set(userId: string, premium: boolean): Promise<void> {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now >= entry.expiresAt) this.entries.delete(key);
    }
    this.entries.set(userId, { premium, expiresAt: now + 120_000 });
  }

  async delete(userId: string): Promise<void> {
    this.entries.delete(userId);
  }
}

const premiumCache: PremiumCache = new MemoryPremiumCache();

export async function invalidatePremiumCache(userId: string): Promise<void> {
  await premiumCache.delete(userId);
}

export async function isPremium(discordUserId: string): Promise<boolean> {
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const roleId = process.env.PREMIUM_ROLE_ID?.trim();
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const missing = [
    !guildId ? "DISCORD_GUILD_ID" : null,
    !roleId ? "PREMIUM_ROLE_ID" : null,
    !token ? "DISCORD_BOT_TOKEN" : null,
  ].filter(Boolean);
  if (!guildId || !roleId || !token) {
    console.error(`Premium detection is not configured: missing ${missing.join(", ")}`);
    return false;
  }
  if (!/^\d+$/.test(discordUserId)) return false;

  try {
    const cached = await premiumCache.get(discordUserId);
    if (cached !== undefined) return cached;

    const endpoint = `https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/members/${discordUserId}`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bot ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 404) {
        await premiumCache.set(discordUserId, false);
        return false;
      }
      if (response.status === 429) {
        if (attempt === 1) {
          console.error("Premium Discord lookup rate limited after retry");
          return false;
        }
        const body: unknown = await response.json();
        const retryAfter = body && typeof body === "object" && "retry_after" in body
          ? body.retry_after : undefined;
        if (typeof retryAfter !== "number" || !Number.isFinite(retryAfter) || retryAfter < 0 || retryAfter * 1000 > 2_147_483_647) {
          console.error("Premium Discord lookup rate limited; retry delay invalid or exceeds timer range");
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, Math.ceil(retryAfter * 1000)));
        continue;
      }
      if (!response.ok) {
        console.error("Premium Discord lookup failed", { status: response.status });
        return false;
      }
      const member: unknown = await response.json();
      if (!member || typeof member !== "object" || !("roles" in member)
        || !Array.isArray(member.roles) || !member.roles.every((role) => typeof role === "string")) {
        console.error("Premium Discord lookup returned invalid member roles");
        return false;
      }
      const premium = member.roles.includes(roleId);
      await premiumCache.set(discordUserId, premium);
      return premium;
    }
  } catch {
    console.error("Premium Discord lookup failed (network, response, or cache error)");
  }
  return false;
}