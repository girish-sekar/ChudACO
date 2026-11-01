import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/api-auth";
import { isPremium } from "@/lib/premium";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const context = await getAuthenticatedContext();
    if (!context) {
      return NextResponse.json({ premium: false, error: "Unauthorized" }, { status: 401, headers });
    }
    return NextResponse.json({ premium: await isPremium(context.discordId) }, { headers });
  } catch {
    console.error("Current-user premium check failed");
    return NextResponse.json({ premium: false }, { status: 503, headers });
  }
}