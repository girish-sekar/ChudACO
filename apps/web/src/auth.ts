import { prisma } from "@chudaco/db";
import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

type RoleCacheEntry = {
  hasRequiredRole: boolean;
  checkedAt: number;
};

const TEN_MINUTES_MS = 10 * 60 * 1000;
const roleCache = new Map<string, RoleCacheEntry>();

type DiscordProfile = {
  id: string;
  username?: string;
  global_name?: string;
  avatar?: string | null;
};

function getDiscordAvatarUrl(profile: DiscordProfile): string | null {
  if (!profile.avatar) {
    return null;
  }

  return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`;
}

async function checkRequiredRole(discordUserId: string): Promise<boolean> {
  const cached = roleCache.get(discordUserId);
  const now = Date.now();

  if (cached && now - cached.checkedAt < TEN_MINUTES_MS) {
    return cached.hasRequiredRole;
  }

  const guildId = process.env.DISCORD_GUILD_ID;
  const requiredRoleId = process.env.DISCORD_REQUIRED_ROLE_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!guildId || !requiredRoleId || !botToken) {
    return false;
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
      roleCache.set(discordUserId, { hasRequiredRole: false, checkedAt: now });
      return false;
    }

    const member = (await response.json()) as { roles?: string[] };
    hasRequiredRole = member.roles?.includes(requiredRoleId) ?? false;
  } catch {
    roleCache.set(discordUserId, { hasRequiredRole: false, checkedAt: now });
    return false;
  }

  // This should move to Redis in production to share cache across instances.
  roleCache.set(discordUserId, { hasRequiredRole, checkedAt: now });
  return hasRequiredRole;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
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
    async signIn({ user, profile }) {
      const discordProfile = profile as DiscordProfile | undefined;
      const discordId = discordProfile?.id;

      if (!discordId) {
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

      const hasRequiredRole = await checkRequiredRole(discordId);
      if (!hasRequiredRole) {
        return "/access-denied";
      }

      return true;
    },
    async jwt({ token, profile }) {
      const discordProfile = profile as DiscordProfile | undefined;

      if (discordProfile?.id) {
        token.discordId = discordProfile.id;
      }

      const discordId = typeof token.discordId === "string" ? token.discordId : undefined;

      if (discordId) {
        token.hasRequiredRole = await checkRequiredRole(discordId);
      } else {
        token.hasRequiredRole = false;
      }

      return token;
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