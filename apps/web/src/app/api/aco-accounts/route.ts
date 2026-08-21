import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/api-auth";
import { encryptImapPassword } from "@/lib/crypto";

const createAcoAccountSchema = z.object({
  label: z.string().trim().min(1),
  retailer: z.string().trim().min(1),
  email: z.string().trim().email(),
  imapHost: z.string().trim().min(1),
  imapPort: z.number().int().min(1).max(65535),
  imapSecurity: z.string().trim().min(1),
  password: z.string().min(1),
});

type SanitizedAcoAccount = {
  id: string;
  userId: string;
  label: string;
  retailer: string;
  email: string;
  status: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: string;
  lastSyncAt: Date | null;
};

function sanitizeAcoAccount(account: {
  id: string;
  userId: string;
  label: string;
  retailer: string;
  email: string;
  status: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: string;
  lastSyncAt: Date | null;
}): SanitizedAcoAccount {
  return {
    id: account.id,
    userId: account.userId,
    label: account.label,
    retailer: account.retailer,
    email: account.email,
    status: account.status,
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    imapSecurity: account.imapSecurity,
    lastSyncAt: account.lastSyncAt,
  };
}

export async function GET() {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.acoAccount.findMany({
    where: { userId: authContext.userId },
    select: {
      id: true,
      userId: true,
      label: true,
      retailer: true,
      email: true,
      status: true,
      imapHost: true,
      imapPort: true,
      imapSecurity: true,
      lastSyncAt: true,
    },
    orderBy: { label: "asc" },
  });

  return NextResponse.json({
    data: accounts.map((account) => sanitizeAcoAccount(account)),
  });
}

export async function POST(request: Request) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createAcoAccountSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const encrypted = encryptImapPassword(parsed.data.password);

  const account = await prisma.acoAccount.create({
    data: {
      userId: authContext.userId,
      label: parsed.data.label,
      retailer: parsed.data.retailer,
      email: parsed.data.email,
      imapHost: parsed.data.imapHost,
      imapPort: parsed.data.imapPort,
      imapSecurity: parsed.data.imapSecurity,
      encryptedPassword: encrypted.encryptedPassword,
      encryptionIv: encrypted.encryptionIv,
    },
    select: {
      id: true,
      userId: true,
      label: true,
      retailer: true,
      email: true,
      status: true,
      imapHost: true,
      imapPort: true,
      imapSecurity: true,
      lastSyncAt: true,
    },
  });

  return NextResponse.json({ data: sanitizeAcoAccount(account) }, { status: 201 });
}