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
  onlyOneCheckout: z.boolean().optional(),
  billingSameAsShipping: z.boolean().optional(),
  loginEmail: z.string().trim().email(),
  retailerLogins: z
    .array(
      z.object({
        retailer: z.string().trim().min(1),
        loginEmail: z.string().trim().email(),
        loginPassword: z.string().optional(),
      }),
    )
    .min(1)
    .optional(),
  shippingName: z.string().trim().max(200).nullable().optional(),
  shippingPhone: z.string().trim().max(50).nullable().optional(),
  shippingAddr: z.string().trim().max(300).nullable().optional(),
  shippingCity: z.string().trim().max(120).nullable().optional(),
  shippingState: z.string().trim().max(120).nullable().optional(),
  shippingZip: z.string().trim().max(30).nullable().optional(),
  billingName: z.string().trim().max(200).nullable().optional(),
  billingPhone: z.string().trim().max(50).nullable().optional(),
  billingAddr: z.string().trim().max(300).nullable().optional(),
  billingCity: z.string().trim().max(120).nullable().optional(),
  billingState: z.string().trim().max(120).nullable().optional(),
  billingZip: z.string().trim().max(30).nullable().optional(),
  imapHost: z.string().trim().min(1),
  imapPort: z.number().int().min(1).max(65535),
  imapSecurity: z.string().trim().min(1),
  password: z.string().min(1),
  loginPassword: z.string().optional(),
});

type SanitizedAcoAccount = {
  id: string;
  userId: string;
  accountNumber: number;
  botProfileName: string;
  label: string;
  retailer: string;
  email: string;
  emailProvider: string | null;
  onlyOneCheckout: boolean;
  loginEmail: string | null;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddr: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingZip: string | null;
  billingSameAsShipping: boolean;
  billingName: string | null;
  billingPhone: string | null;
  billingAddr: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingZip: string | null;
  status: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: string;
  lastSyncAt: Date | null;
  retailerLogins: {
    id: string;
    retailer: string;
    loginEmail: string;
  }[];
};

function sanitizeAcoAccount(account: {
  id: string;
  userId: string;
  accountNumber: number;
  botProfileName: string;
  label: string;
  retailer: string;
  email: string;
  emailProvider: string | null;
  onlyOneCheckout: boolean;
  loginEmail: string | null;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddr: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingZip: string | null;
  billingSameAsShipping: boolean;
  billingName: string | null;
  billingPhone: string | null;
  billingAddr: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingZip: string | null;
  status: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: string;
  lastSyncAt: Date | null;
  retailerLogins: {
    id: string;
    retailer: string;
    loginEmail: string;
  }[];
}): SanitizedAcoAccount {
  return {
    id: account.id,
    userId: account.userId,
    accountNumber: account.accountNumber,
    botProfileName: account.botProfileName,
    label: account.label,
    retailer: account.retailer,
    email: account.email,
    emailProvider: account.emailProvider,
    onlyOneCheckout: account.onlyOneCheckout,
    loginEmail: account.loginEmail,
    shippingName: account.shippingName,
    shippingPhone: account.shippingPhone,
    shippingAddr: account.shippingAddr,
    shippingCity: account.shippingCity,
    shippingState: account.shippingState,
    shippingZip: account.shippingZip,
    billingSameAsShipping: account.billingSameAsShipping,
    billingName: account.billingName,
    billingPhone: account.billingPhone,
    billingAddr: account.billingAddr,
    billingCity: account.billingCity,
    billingState: account.billingState,
    billingZip: account.billingZip,
    status: account.status,
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    imapSecurity: account.imapSecurity,
    lastSyncAt: account.lastSyncAt,
    retailerLogins: account.retailerLogins,
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
      accountNumber: true,
      botProfileName: true,
      label: true,
      retailer: true,
      email: true,
      emailProvider: true,
      onlyOneCheckout: true,
      loginEmail: true,
      shippingName: true,
      shippingPhone: true,
      shippingAddr: true,
      shippingCity: true,
      shippingState: true,
      shippingZip: true,
      billingSameAsShipping: true,
      billingName: true,
      billingPhone: true,
      billingAddr: true,
      billingCity: true,
      billingState: true,
      billingZip: true,
      status: true,
      imapHost: true,
      imapPort: true,
      imapSecurity: true,
      lastSyncAt: true,
      retailerLogins: {
        select: {
          id: true,
          retailer: true,
          loginEmail: true,
        },
        orderBy: { retailer: "asc" },
      },
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
  const payloadRetailerLogins =
    parsed.data.retailerLogins && parsed.data.retailerLogins.length > 0
      ? parsed.data.retailerLogins
      : [
          {
            retailer: parsed.data.retailer,
            loginEmail: parsed.data.loginEmail,
            loginPassword: parsed.data.loginPassword,
          },
        ];

  const encryptedRetailerLogins = payloadRetailerLogins.map((entry) => {
    const hasPassword = Boolean(entry.loginPassword && entry.loginPassword.trim().length > 0);
    const encrypted = hasPassword ? encryptImapPassword(entry.loginPassword as string) : null;

    return {
      retailer: entry.retailer,
      loginEmail: entry.loginEmail,
      encryptedLoginPassword: encrypted?.encryptedPassword ?? null,
      loginPasswordIv: encrypted?.encryptionIv ?? null,
    };
  });

  const primaryRetailerLogin = encryptedRetailerLogins[0];
  const billingSameAsShipping = parsed.data.billingSameAsShipping ?? true;

  const account = await prisma.$transaction(async (tx) => {
    const userAfterIncrement = await tx.user.update({
      where: { id: authContext.userId },
      data: {
        nextAcoAccountNumber: { increment: 1 },
      },
      select: {
        username: true,
        nextAcoAccountNumber: true,
      },
    });

    const accountNumber = userAfterIncrement.nextAcoAccountNumber - 1;
    const botProfileName = `${userAfterIncrement.username} - ACO #${accountNumber}`;

    return tx.acoAccount.create({
      data: {
        userId: authContext.userId,
        accountNumber,
        botProfileName,
        label: parsed.data.label,
        email: parsed.data.email,
        emailProvider: parsed.data.emailProvider ?? null,
        onlyOneCheckout: parsed.data.onlyOneCheckout ?? true,
        retailer: primaryRetailerLogin.retailer,
        loginEmail: primaryRetailerLogin.loginEmail,
        shippingName: parsed.data.shippingName ?? null,
        shippingPhone: parsed.data.shippingPhone ?? null,
        shippingAddr: parsed.data.shippingAddr ?? null,
        shippingCity: parsed.data.shippingCity ?? null,
        shippingState: parsed.data.shippingState ?? null,
        shippingZip: parsed.data.shippingZip ?? null,
        billingSameAsShipping,
        billingName: billingSameAsShipping ? null : (parsed.data.billingName ?? null),
        billingPhone: billingSameAsShipping ? null : (parsed.data.billingPhone ?? null),
        billingAddr: billingSameAsShipping ? null : (parsed.data.billingAddr ?? null),
        billingCity: billingSameAsShipping ? null : (parsed.data.billingCity ?? null),
        billingState: billingSameAsShipping ? null : (parsed.data.billingState ?? null),
        billingZip: billingSameAsShipping ? null : (parsed.data.billingZip ?? null),
        imapHost: parsed.data.imapHost,
        imapPort: parsed.data.imapPort,
        imapSecurity: parsed.data.imapSecurity,
        encryptedPassword: encryptedImapPassword.encryptedPassword,
        encryptionIv: encryptedImapPassword.encryptionIv,
        encryptedLoginPassword: primaryRetailerLogin.encryptedLoginPassword,
        loginPasswordIv: primaryRetailerLogin.loginPasswordIv,
        retailerLogins: {
          create: encryptedRetailerLogins,
        },
      },
      select: {
        id: true,
        userId: true,
        accountNumber: true,
        botProfileName: true,
        label: true,
        retailer: true,
        email: true,
        emailProvider: true,
        onlyOneCheckout: true,
        loginEmail: true,
        shippingName: true,
        shippingPhone: true,
        shippingAddr: true,
        shippingCity: true,
        shippingState: true,
        shippingZip: true,
        billingSameAsShipping: true,
        billingName: true,
        billingPhone: true,
        billingAddr: true,
        billingCity: true,
        billingState: true,
        billingZip: true,
        status: true,
        imapHost: true,
        imapPort: true,
        imapSecurity: true,
        lastSyncAt: true,
        retailerLogins: {
          select: {
            id: true,
            retailer: true,
            loginEmail: true,
          },
          orderBy: { retailer: "asc" },
        },
      },
    });
  });

  let syncWarning: string | null = null;

  try {
    await upsertGoogleSheetShippingFields({
      accountId: account.id,
      botProfileName: account.botProfileName,
      email: account.email,
      loginEmail: account.loginEmail,
      onlyOneCheckout: account.onlyOneCheckout,
      shippingName: account.shippingName,
      shippingPhone: account.shippingPhone,
      shippingAddr: account.shippingAddr,
      shippingCity: account.shippingCity,
      shippingState: account.shippingState,
      shippingZip: account.shippingZip,
      billingSameAsShipping: account.billingSameAsShipping,
      billingName: account.billingName,
      billingPhone: account.billingPhone,
      billingAddr: account.billingAddr,
      billingCity: account.billingCity,
      billingState: account.billingState,
      billingZip: account.billingZip,
    });
  } catch (error: unknown) {
    syncWarning =
      error instanceof Error
        ? `Account created, but Google Sheets sync failed: ${error.message}`
        : "Account created, but Google Sheets sync failed.";
  }

  return NextResponse.json({ data: sanitizeAcoAccount(account), warning: syncWarning }, { status: 201 });
}