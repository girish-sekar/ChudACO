import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/api-auth";
import { encryptImapPassword } from "@/lib/crypto";
import { upsertGoogleSheetShippingFields } from "@/lib/google-sheets-relay";

const createAcoAccountSchema = z.object({
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
  password: z.string().min(1),
  loginPassword: z.string().min(1),
});

type SanitizedAcoAccount = {
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
};

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
}): SanitizedAcoAccount {
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

  const encryptedImapPassword = encryptImapPassword(parsed.data.password);
  const encryptedRetailLoginPassword = encryptImapPassword(parsed.data.loginPassword);

  const account = await prisma.acoAccount.create({
    data: {
      userId: authContext.userId,
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
      encryptedPassword: encryptedImapPassword.encryptedPassword,
      encryptionIv: encryptedImapPassword.encryptionIv,
      encryptedLoginPassword: encryptedRetailLoginPassword.encryptedPassword,
      loginPasswordIv: encryptedRetailLoginPassword.encryptionIv,
    },
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
        error: "Account created but failed to sync shipping info to Google Sheets",
        detail: message,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ data: sanitizeAcoAccount(account) }, { status: 201 });
}