import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/api-auth";
import { normalizeProfile, profileAccountData, profileInclude, profileSchema, syncAccountSheet } from "@/lib/aco-library";

type RouteParams = {
  params: {
    id: string;
  };
};

export async function PATCH(request: Request, context: RouteParams) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.acoProfile.findFirst({
    where: { id: context.params.id, userId: authContext.userId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const duplicate = await prisma.acoProfile.findFirst({
    where: {
      userId: authContext.userId,
      id: { not: existing.id },
      name: { equals: parsed.data.name, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: `A profile named "${parsed.data.name}" already exists.` }, { status: 409 });
  }

  const values = normalizeProfile(parsed.data);
  const profile = await prisma.$transaction(async (tx) => {
    await tx.acoAccount.updateMany({ where: { profileId: existing.id }, data: profileAccountData(values) });
    return tx.acoProfile.update({ where: { id: existing.id }, data: values, include: profileInclude });
  });

  const warnings: string[] = [];
  for (const account of profile.accounts) {
    const warning = await syncAccountSheet(account.id);
    if (warning) warnings.push(`#${account.accountNumber}: ${warning}`);
  }

  return NextResponse.json({ data: profile, warning: warnings.length ? warnings.join(" ") : null });
}

export async function DELETE(_request: Request, context: RouteParams) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.acoProfile.findFirst({
    where: { id: context.params.id, userId: authContext.userId },
    select: { id: true, _count: { select: { accounts: true, retailerProfiles: true } } },
  });
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  if (profile._count.accounts > 0 || profile._count.retailerProfiles > 0) {
    return NextResponse.json({ error: "Unlink this profile from all accounts before deleting it." }, { status: 409 });
  }

  await prisma.acoProfile.delete({ where: { id: profile.id } });
  return NextResponse.json({ data: null });
}
