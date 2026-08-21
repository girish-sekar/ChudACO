import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/api-auth";
import { encryptImapPassword } from "@/lib/crypto";

const updateAcoAccountSchema = z.object({
  label: z.string().trim().min(1),
  retailer: z.string().trim().min(1),
  email: z.string().trim().email(),
  loginEmail: z.string().trim().email(),
  imapHost: z.string().trim().min(1),
  imapPort: z.number().int().min(1).max(65535),
  imapSecurity: z.string().trim().min(1),
  password: z.string().optional(),
  loginPassword: z.string().optional(),
  status: z.enum(["active", "locked", "banned"]),
});

function sanitizeAcoAccount(account: {
  id: string;
  userId: string;
  label: string;
  retailer: string;
  email: string;
  loginEmail: string | null;
  status: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: string;
  lastSyncAt: Date | null;
}) {
  return {
    id: account.id,
    userId: account.userId,
    label: account.label,
    retailer: account.retailer,
    email: account.email,
    loginEmail: account.loginEmail,
    status: account.status,
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    imapSecurity: account.imapSecurity,
    lastSyncAt: account.lastSyncAt,
  };
}

type RouteParams = {
  params: {
    id: string;
  };
};

export async function PUT(request: Request, context: RouteParams) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateAcoAccountSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await prisma.acoAccount.findFirst({
    where: { id: context.params.id, userId: authContext.userId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const nextData: {
    label: string;
    retailer: string;
    email: string;
    loginEmail: string;
    imapHost: string;
    imapPort: number;
    imapSecurity: string;
    status: "active" | "locked" | "banned";
    encryptedPassword?: string;
    encryptionIv?: string;
    encryptedLoginPassword?: string;
    loginPasswordIv?: string;
  } = {
    label: parsed.data.label,
    retailer: parsed.data.retailer,
    email: parsed.data.email,
    loginEmail: parsed.data.loginEmail,
    imapHost: parsed.data.imapHost,
    imapPort: parsed.data.imapPort,
    imapSecurity: parsed.data.imapSecurity,
    status: parsed.data.status,
  };

  if (parsed.data.password && parsed.data.password.trim().length > 0) {
    const encryptedImapPassword = encryptImapPassword(parsed.data.password);
    nextData.encryptedPassword = encryptedImapPassword.encryptedPassword;
    nextData.encryptionIv = encryptedImapPassword.encryptionIv;
  }

  if (parsed.data.loginPassword && parsed.data.loginPassword.trim().length > 0) {
    const encryptedLoginPassword = encryptImapPassword(parsed.data.loginPassword);
    nextData.encryptedLoginPassword = encryptedLoginPassword.encryptedPassword;
    nextData.loginPasswordIv = encryptedLoginPassword.encryptionIv;
  }

  const account = await prisma.acoAccount.update({
    where: { id: context.params.id },
    data: nextData,
    select: {
      id: true,
      userId: true,
      label: true,
      retailer: true,
      email: true,
      loginEmail: true,
      status: true,
      imapHost: true,
      imapPort: true,
      imapSecurity: true,
      lastSyncAt: true,
    },
  });

  return NextResponse.json({ data: sanitizeAcoAccount(account) });
}

export async function DELETE(_request: Request, context: RouteParams) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.acoAccount.findFirst({
    where: { id: context.params.id, userId: authContext.userId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  await prisma.acoAccount.delete({ where: { id: context.params.id } });

  return NextResponse.json({ success: true });
}