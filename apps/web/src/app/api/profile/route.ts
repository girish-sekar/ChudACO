import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/api-auth";

const profileUpdateSchema = z
  .object({
    notifyOnSuccess: z.boolean().optional(),
    notifyOnFailure: z.boolean().optional(),
    notifyWeeklySummary: z.boolean().optional(),
  })
  .strict();

export async function GET() {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.user.findUnique({
    where: { id: authContext.userId },
    select: {
      id: true,
      discordId: true,
      username: true,
      avatarUrl: true,
      notifyOnSuccess: true,
      notifyOnFailure: true,
      notifyWeeklySummary: true,
      createdAt: true,
    },
  });

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({ data: profile });
}

export async function PATCH(request: Request) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = profileUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates = Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value !== undefined),
  );

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  const updatedProfile = await prisma.user.update({
    where: { id: authContext.userId },
    data: updates,
    select: {
      id: true,
      discordId: true,
      username: true,
      avatarUrl: true,
      notifyOnSuccess: true,
      notifyOnFailure: true,
      notifyWeeklySummary: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: updatedProfile });
}