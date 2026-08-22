import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/api-auth";
import { encryptImapPassword } from "@/lib/crypto";
import { deleteGoogleSheetRowsForAccount } from "@/lib/google-sheets-relay";
import { upsertGoogleSheetShippingFields } from "@/lib/google-sheets-relay";

const updateAcoAccountSchema = z.object({
  label: z.string().trim().min(1),
  retailer: z.string().trim().min(1),
  email: z.string().trim().email(),
  emailProvider: z.string().trim().max(120).nullable().optional(),
  loginEmail: z.string().trim().email(),
  shippingName: z.string().trim().max(200).nullable().optional(),
  shippingPhone: z.string().trim().max(50).nullable().optional(),
  shippingAddr: z.string().trim().max(300).nullable().optional(),
  shippingCity: z.string().trim().max(120).nullable().optional(),
  shippingState: z.string().trim().max(120).nullable().optional(),
  shippingZip: z.string().trim().max(30).nullable().optional(),
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
  emailProvider: string | null;
  loginEmail: string | null;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddr: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingZip: string | null;
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
    emailProvider: account.emailProvider,
    loginEmail: account.loginEmail,
    shippingName: account.shippingName,
    shippingPhone: account.shippingPhone,
    shippingAddr: account.shippingAddr,
    shippingCity: account.shippingCity,
    shippingState: account.shippingState,
    shippingZip: account.shippingZip,
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

async function handleUpdate(request: Request, context: RouteParams) {
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
    emailProvider: string | null;
    loginEmail: string;
    shippingName: string | null;
    shippingPhone: string | null;
    shippingAddr: string | null;
    shippingCity: string | null;
    shippingState: string | null;
    shippingZip: string | null;
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
    emailProvider: parsed.data.emailProvider ?? null,
    loginEmail: parsed.data.loginEmail,
    shippingName: parsed.data.shippingName ?? null,
    shippingPhone: parsed.data.shippingPhone ?? null,
    shippingAddr: parsed.data.shippingAddr ?? null,
    shippingCity: parsed.data.shippingCity ?? null,
    shippingState: parsed.data.shippingState ?? null,
    shippingZip: parsed.data.shippingZip ?? null,
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
      emailProvider: true,
      loginEmail: true,
      shippingName: true,
      shippingPhone: true,
      shippingAddr: true,
      shippingCity: true,
      shippingState: true,
      shippingZip: true,
      status: true,
      imapHost: true,
      imapPort: true,
      imapSecurity: true,
      lastSyncAt: true,
    },
  });

  try {
    await upsertGoogleSheetShippingFields({
      accountId: account.id,
      label: account.label,
      email: account.email,
      loginEmail: account.loginEmail,
      shippingName: account.shippingName,
      shippingPhone: account.shippingPhone,
      shippingAddr: account.shippingAddr,
      shippingCity: account.shippingCity,
      shippingState: account.shippingState,
      shippingZip: account.shippingZip,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown Google Sheets error";
    return NextResponse.json(
      {
        error: "Failed to sync account update to Google Sheets",
        detail: message,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ data: sanitizeAcoAccount(account) });
}

export async function PUT(request: Request, context: RouteParams) {
  return handleUpdate(request, context);
}

export async function PATCH(request: Request, context: RouteParams) {
  return handleUpdate(request, context);
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

  try {
    await deleteGoogleSheetRowsForAccount(existing.id);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown Google Sheets error";
    return NextResponse.json(
      {
        error: "Failed to delete account row in Google Sheets",
        detail: message,
      },
      { status: 502 },
    );
  }

  await prisma.$transaction([
    prisma.cardOnFile.deleteMany({ where: { acoAccountId: context.params.id } }),
    prisma.acoAccount.delete({ where: { id: context.params.id } }),
  ]);

  return NextResponse.json({ success: true });
}