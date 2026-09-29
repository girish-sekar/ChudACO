import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/api-auth";
import { imapConfigSchema, sanitizeImapConfig } from "@/lib/aco-library";
import { encryptImapPassword } from "@/lib/crypto";

export async function GET() {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configs = await prisma.acoImapConfig.findMany({
    where: { userId: authContext.userId },
    include: { accounts: { select: { id: true, accountNumber: true, label: true, lastSyncAt: true }, orderBy: { accountNumber: "asc" } } },
    orderBy: { email: "asc" },
  });

  return NextResponse.json({ data: configs.map(sanitizeImapConfig) });
}

export async function POST(request: Request) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = imapConfigSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
  }

  const duplicate = await prisma.acoImapConfig.findFirst({
    where: { userId: authContext.userId, email: { equals: parsed.data.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: `An IMAP inbox for ${parsed.data.email} already exists.` }, { status: 409 });
  }

  const encrypted = parsed.data.password?.trim() ? encryptImapPassword(parsed.data.password) : null;
  const config = await prisma.acoImapConfig.create({
    data: {
      userId: authContext.userId,
      email: parsed.data.email,
      emailProvider: parsed.data.emailProvider || null,
      imapHost: parsed.data.imapHost,
      imapPort: parsed.data.imapPort ?? 993,
      imapSecurity: parsed.data.imapSecurity ?? "SSL/TLS",
      encryptedPassword: encrypted?.encryptedPassword ?? null,
      encryptionIv: encrypted?.encryptionIv ?? null,
    },
    include: { accounts: { select: { id: true, accountNumber: true, label: true, lastSyncAt: true } } },
  });

  return NextResponse.json({ data: sanitizeImapConfig(config) }, { status: 201 });
}
