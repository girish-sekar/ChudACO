import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminDiscordIds } from "@/lib/api-auth";

type DebugResult = {
  discordId: string;
  sessionHasRequiredRole: boolean;
  env: {
    hasGuildId: boolean;
    hasRequiredRoleId: boolean;
    hasBotToken: boolean;
    guildId: string | null;
    requiredRoleId: string | null;
  };
  botLookup?: {
    endpoint: string;
    ok: boolean;
    status: number;
    statusText: string;
    roleCount?: number;
    hasRequiredRole?: boolean;
  };
  error?: string;
};

export async function GET(request: Request) {
  const session = await auth();
  const sessionDiscordId = session?.user?.discordId;
  const admins = getAdminDiscordIds();

  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const debugKeyFromQuery = searchParams.get("debugKey")?.trim();
  const debugDiscordId = searchParams.get("discordId")?.trim();
  const internalApiKey = process.env.INTERNAL_API_KEY?.trim();

  const hasAdminSession = Boolean(sessionDiscordId && admins.has(sessionDiscordId));
  const hasDebugKey =
    Boolean(internalApiKey) &&
    Boolean(debugKeyFromQuery) &&
    debugKeyFromQuery === internalApiKey;

  if (!hasAdminSession && !hasDebugKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const discordId = (hasAdminSession ? sessionDiscordId : debugDiscordId) ?? "";

  if (!discordId) {
    return NextResponse.json(
      { error: "Missing discordId query parameter for key-based debug mode" },
      { status: 400 },
    );
  }

  const guildId = process.env.DISCORD_GUILD_ID?.trim() || null;
  const requiredRoleId = process.env.DISCORD_REQUIRED_ROLE_ID?.trim() || null;
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim() || null;

  const result: DebugResult = {
    discordId,
    sessionHasRequiredRole: Boolean(session?.user?.hasRequiredRole),
    env: {
      hasGuildId: Boolean(guildId),
      hasRequiredRoleId: Boolean(requiredRoleId),
      hasBotToken: Boolean(botToken),
      guildId,
      requiredRoleId,
    },
  };

  if (!guildId || !requiredRoleId || !botToken) {
    result.error = "Missing required Discord env vars";
    return NextResponse.json(result, { status: 200 });
  }

  const endpoint = `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
      cache: "no-store",
    });

    const debugLookup: DebugResult["botLookup"] = {
      endpoint,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    };

    if (response.ok) {
      const member = (await response.json()) as { roles?: string[] };
      const roles = Array.isArray(member.roles) ? member.roles : [];
      debugLookup.roleCount = roles.length;
      debugLookup.hasRequiredRole = roles.includes(requiredRoleId);
    }

    result.botLookup = debugLookup;
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Bot lookup failed";
    return NextResponse.json(result, { status: 200 });
  }
}