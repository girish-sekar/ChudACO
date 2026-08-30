import Discord from "next-auth/providers/discord";
import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth configuration. This file must NOT import any server-only
 * modules (prisma, node built-ins, etc.) because it's used by the Edge
 * middleware. Server-only logic (prisma upsert, Discord API role checks)
 * lives in auth.ts which extends this config.
 */

function isAdminDiscordId(discordId: string): boolean {
  const raw = process.env.ADMIN_DISCORD_IDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(discordId);
}

export const authConfig: NextAuthConfig = {
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
    jwt({ token, profile }) {
      if (profile?.id) {
        token.discordId = profile.id as string;
      }

      // Admin bypass: always grant access for admin Discord IDs.
      const discordId =
        typeof token.discordId === "string" ? token.discordId : undefined;
      if (discordId && isAdminDiscordId(discordId)) {
        token.hasRequiredRole = true;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.discordId =
          typeof token.discordId === "string" ? token.discordId : undefined;
        session.user.hasRequiredRole = Boolean(token.hasRequiredRole);
      }

      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
