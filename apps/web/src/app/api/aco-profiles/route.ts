import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/api-auth";
import { linkedAccountsSelect, normalizeProfile, profileSchema } from "@/lib/aco-library";

export async function GET() {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profiles = await prisma.acoProfile.findMany({
    where: { userId: authContext.userId },
    include: linkedAccountsSelect,
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: profiles });
}

export async function POST(request: Request) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
  }

  const duplicate = await prisma.acoProfile.findFirst({
    where: { userId: authContext.userId, name: { equals: parsed.data.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: `A profile named "${parsed.data.name}" already exists.` }, { status: 409 });
  }

  const profile = await prisma.acoProfile.create({
    data: { userId: authContext.userId, ...normalizeProfile(parsed.data) },
    include: linkedAccountsSelect,
  });

  return NextResponse.json({ data: profile }, { status: 201 });
}
