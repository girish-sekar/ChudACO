import { prisma } from "@chudaco/db";
import { auth } from "@/auth";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";

export type AuthenticatedContext = {
  discordId: string;
  discordUsername?: string | null;
  userId: string;
};

export async function getAuthenticatedContext(): Promise<AuthenticatedContext | null> {
  const session = await auth();
  const discordId = session?.user?.discordId;

  if (!discordId) {
    return null;
  }

  const isAdmin = getAdminDiscordIds().has(discordId);
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { id: true, termsVersion: true, discordAccessStatus: true },
  });

  if (
    !user ||
    user.termsVersion !== CURRENT_TERMS_VERSION ||
    (!isAdmin && user.discordAccessStatus !== "active")
  ) {
    return null;
  }

  return {
    discordId,
    discordUsername: session?.user?.discordUsername ?? session?.user?.name ?? null,
    userId: user.id,
  };
}

export function getAdminDiscordIds(): Set<string> {
  const raw = process.env.ADMIN_DISCORD_IDS ?? "";
  const ids = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return new Set(ids);
}