import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

function isAdminDiscordId(discordId: string): boolean {
  const raw = process.env.ADMIN_DISCORD_IDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(discordId);
}

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const discordId = typeof token?.discordId === "string" ? token.discordId : undefined;
  const hasRequiredRole = Boolean(token?.hasRequiredRole);
  const isAdmin = discordId ? isAdminDiscordId(discordId) : false;

  if (!token || (!hasRequiredRole && !isAdmin)) {
    const loginUrl = new URL("/login", request.nextUrl);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};