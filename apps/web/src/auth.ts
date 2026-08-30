import { prisma } from "@chudaco/db";
import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

type RoleCacheEntry = {
  hasRequiredRole: boolean;
  checkedAt: number;
};

const POSITIVE_ROLE_CACHE_MS = 10 * 60 * 1000;
const NEGATIVE_ROLE_CACHE_MS = 30 * 1000;
const roleCache = new Map<string, RoleCacheEntry>();

type DiscordProfile = {
  id: string;
  username?: string;
  global_name?: string;
  avatar?: string | null;
};

type DiscordMember = {
  roles?: string[];
};

type RoleToken = {
  discordId?: string;
  hasRequiredRole?: boolean;
  roleCheckedAt?: number;
};

function getDiscordAvatarUrl(profile: DiscordProfile | undefined): string | null {
  if (!profile?.avatar) {
    return null;
  }

  return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`;
}

async function checkRequiredRole(discordUserId: string): Promise<boolean | null> {
  const cached = roleCache.get(discordUserId);
  const now = Date.now();

  if (cached) {
    const ttlMs = cached.hasRequiredRole ? POSITIVE_ROLE_CACHE_MS : NEGATIVE_ROLE_CACHE_MS;
    if (now - cached.checkedAt < ttlMs) {
      return cached.hasRequiredRole;
    }
  }

  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const requiredRoleId = process.env.DISCORD_REQUIRED_ROLE_ID?.trim();
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();

  if (!guildId || !requiredRoleId || !botToken) {
    return null;
  }

  const endpoint = `https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}`;

  let hasRequiredRole = false;

  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("discord role check failed (bot token)", {
        status: response.status,
        statusText: response.statusText,
      });

      // 404 is a definitive "not in guild member list" answer.
      if (response.status === 404) {
        roleCache.set(discordUserId, { hasRequiredRole: false, checkedAt: now });
        return false;
      }

      return null;
    }

    const member = (await response.json()) as { roles?: string[] };
    hasRequiredRole = member.roles?.includes(requiredRoleId) ?? false;
  } catch {
    console.error("discord role check failed (bot token request error)");
    return null;
  }

  // This should move to Redis in production to share cache across instances.
  roleCache.set(discordUserId, { hasRequiredRole, checkedAt: now });
  return hasRequiredRole;
}

async function checkRequiredRoleWithAccessToken(
  discordUserId: string,
  accessToken: string,
): Promise<boolean | null> {
  const now = Date.now();
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const requiredRoleId = process.env.DISCORD_REQUIRED_ROLE_ID?.trim();

  if (!guildId || !requiredRoleId) {
    return null;
  }

  const endpoint = `https://discord.com/api/v10/users/@me/guilds/${guildId}/member`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("discord role check failed (oauth token)", {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const member = (await response.json()) as DiscordMember;
    const hasRequiredRole = member.roles?.includes(requiredRoleId) ?? false;
    roleCache.set(discordUserId, { hasRequiredRole, checkedAt: now });
    return hasRequiredRole;
  } catch {
    console.error("discord role check failed (oauth token request error)");
    return null;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID?.trim() ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET?.trim() ?? "",
      authorization: {
        params: {
          scope: "identify guilds guilds.members.read",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, profile, account }) {
      const discordProfile = profile as DiscordProfile | undefined;
      const discordId =
        discordProfile?.id ||
        (account?.provider === "discord" ? account.providerAccountId : undefined);

      if (!discordId) {
        console.error("discord sign-in rejected: missing discord id in profile/account");
        return false;
      }

      const username =
        discordProfile?.username ?? discordProfile?.global_name ?? user.name ?? "discord-user";
      const avatarUrl = getDiscordAvatarUrl(discordProfile);

      await prisma.user.upsert({
        where: { discordId },
        update: {
          username,
          avatarUrl,
        },
        create: {
          discordId,
          username,
          avatarUrl,
        },
      });

      // Always force a fresh read on sign-in to avoid stale in-memory false cache.
      roleCache.delete(discordId);
      let hasRequiredRole = await checkRequiredRole(discordId);

      if (hasRequiredRole !== true) {
        const accessToken =
          account && typeof account.access_token === "string" ? account.access_token : undefined;

        if (accessToken) {
          const fallbackResult = await checkRequiredRoleWithAccessToken(discordId, accessToken);
          if (fallbackResult !== null) {
            hasRequiredRole = fallbackResult;
          }
        }
      }

      if (hasRequiredRole === false) {
        console.error("discord sign-in rejected: required role missing", {
          discordId,
          hasAccessToken: Boolean(account && typeof account.access_token === "string"),
        });
        return "/access-denied";
      }

      if (hasRequiredRole !== true) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("discord role check indeterminate in development; allowing sign-in");
          return true;
        }

        console.warn("discord role check indeterminate in production; allowing sign-in", {
          discordId,
          hasAccessToken: Boolean(account && typeof account.access_token === "string"),
        });
        return true;
      }

      return true;
    },
    async jwt({ token, profile, account, trigger }) {
      const roleToken = token as RoleToken;
      const discordProfile = profile as DiscordProfile | undefined;

      if (discordProfile?.id) {
        roleToken.discordId = discordProfile.id;
      }

      const discordId = typeof roleToken.discordId === "string" ? roleToken.discordId : undefined;

      const now = Date.now();
      const hasCachedRole = typeof roleToken.hasRequiredRole === "boolean";
      const cacheWindowMs = roleToken.hasRequiredRole ? POSITIVE_ROLE_CACHE_MS : NEGATIVE_ROLE_CACHE_MS;
      const recentlyChecked =
        typeof roleToken.roleCheckedAt === "number" && now - roleToken.roleCheckedAt < cacheWindowMs;

      // Always force refresh for negative role checks (denied access) to prevent lockout.
      // For positive checks, only refresh on sign-in or when stale.
      const shouldRefreshRole =
        trigger === "signIn" || 
        !hasCachedRole || 
        !recentlyChecked ||
        roleToken.hasRequiredRole === false;

      if (discordId && shouldRefreshRole) {
        let resolvedRole = await checkRequiredRole(discordId);

        if (resolvedRole !== true) {
          const accessToken =
            account && typeof account.access_token === "string" ? account.access_token : undefined;

          if (accessToken) {
            const fallbackResult = await checkRequiredRoleWithAccessToken(discordId, accessToken);
            if (fallbackResult !== null) {
              resolvedRole = fallbackResult;
            }
          }
        }

        if (resolvedRole === true || resolvedRole === false) {
          // Definitive answer from Discord: update the token
          roleToken.hasRequiredRole = resolvedRole;
          roleToken.roleCheckedAt = now;
        } else {
          // Role check returned null (indeterminate - network error, API timeout, etc.)
          if (trigger === "signIn") {
            // On sign-in, if indeterminate, default to true (signIn callback already succeeded)
            roleToken.hasRequiredRole = true;
            roleToken.roleCheckedAt = now;
          } else if (typeof roleToken.hasRequiredRole === "boolean") {
            // Keep existing value - don't let transient failures revoke access
            // Just update the timestamp so we retry sooner (negative cache TTL)
            roleToken.roleCheckedAt = now;
          } else {
            // First time ever (no existing value) and not sign-in: default to false
            roleToken.hasRequiredRole = false;
            roleToken.roleCheckedAt = now;
          }
       }
      } else if (!discordId) {
        roleToken.hasRequiredRole = false;
        roleToken.roleCheckedAt = now;
      }

      return roleToken;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.discordId = typeof token.discordId === "string" ? token.discordId : undefined;
        session.user.hasRequiredRole = Boolean(token.hasRequiredRole);
      }

      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});