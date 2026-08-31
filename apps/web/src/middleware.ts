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

// Behind a reverse proxy (Cloudflare Tunnel), the internal request is HTTP
// but cookies were set with __Secure- prefix because NEXTAUTH_URL is HTTPS.
// We must tell getToken() to use the secure cookie name.
const useSecureCookie = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: useSecureCookie,
  });

  const discordId = typeof token?.discordId === "string" ? token.discordId : undefined;
  const hasRequiredRole = Boolean(token?.hasRequiredRole);
  const isAdmin = discordId ? isAdminDiscordId(discordId) : false;

  if (!token || (!hasRequiredRole && !isAdmin)) {
    const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;
    const loginUrl = new URL("/login", baseUrl);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};