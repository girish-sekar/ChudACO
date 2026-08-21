import { prisma } from "@chudaco/db";
import { auth } from "@/auth";

export type AuthenticatedContext = {
  discordId: string;
  userId: string;
};

export async function getAuthenticatedContext(): Promise<AuthenticatedContext | null> {
  const session = await auth();
  const discordId = session?.user?.discordId;

  if (!discordId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { id: true },
  });

  if (!user) {
    return null;
  }

  return {
    discordId,
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