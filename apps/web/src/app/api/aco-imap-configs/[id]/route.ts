import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/api-auth";
import { imapAccountData, imapConfigSchema, sanitizeImapConfig, syncAccountSheet } from "@/lib/aco-library";
import { encryptImapPassword } from "@/lib/crypto";

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

  const parsed = imapConfigSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.acoImapConfig.findFirst({
    where: { id: context.params.id, userId: authContext.userId },
    select: { id: true, encryptedPassword: true, encryptionIv: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "IMAP inbox not found" }, { status: 404 });
  }

  const duplicate = await prisma.acoImapConfig.findFirst({
    where: {
      userId: authContext.userId,
      id: { not: existing.id },
      email: { equals: parsed.data.email, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: `An IMAP inbox for ${parsed.data.email} already exists.` }, { status: 409 });
  }

  const encrypted = parsed.data.password?.trim() ? encryptImapPassword(parsed.data.password) : null;
  const values = {
    email: parsed.data.email,
    emailProvider: parsed.data.emailProvider || null,
    imapHost: parsed.data.imapHost,
    imapPort: parsed.data.imapPort ?? 993,
    imapSecurity: parsed.data.imapSecurity ?? "SSL/TLS",
    encryptedPassword: encrypted?.encryptedPassword ?? existing.encryptedPassword,
    encryptionIv: encrypted?.encryptionIv ?? existing.encryptionIv,
  };

  const config = await prisma.$transaction(async (tx) => {
    await tx.acoAccount.updateMany({ where: { imapConfigId: existing.id }, data: imapAccountData(values) });
    return tx.acoImapConfig.update({
      where: { id: existing.id },
      data: values,
      include: { accounts: { select: { id: true, accountNumber: true, label: true, lastSyncAt: true }, orderBy: { accountNumber: "asc" } } },
    });
  });

  const warnings: string[] = [];
  for (const account of config.accounts) {
    const warning = await syncAccountSheet(account.id);
    if (warning) warnings.push(`#${account.accountNumber}: ${warning}`);
  }

  return NextResponse.json({ data: sanitizeImapConfig(config), warning: warnings.length ? warnings.join(" ") : null });
}

export async function DELETE(_request: Request, context: RouteParams) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await prisma.acoImapConfig.findFirst({
    where: { id: context.params.id, userId: authContext.userId },
    select: { id: true, _count: { select: { accounts: true } } },
  });
  if (!config) {
    return NextResponse.json({ error: "IMAP inbox not found" }, { status: 404 });
  }
  if (config._count.accounts > 0) {
    return NextResponse.json({ error: "Unlink this inbox from all accounts before deleting it." }, { status: 409 });
  }

  await prisma.acoImapConfig.delete({ where: { id: config.id } });
  return NextResponse.json({ data: null });
}
