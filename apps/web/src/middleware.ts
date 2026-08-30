import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard");
  if (!isDashboardRoute) {
    return NextResponse.next();
  }

  const isAuthenticated = Boolean(request.auth?.user);
  const hasRequiredRole = Boolean(request.auth?.user?.hasRequiredRole);

  if (!isAuthenticated || !hasRequiredRole) {
    const loginUrl = new URL("/login", request.nextUrl);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*"],
};