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
}) {
  return {
    id: account.id,
    userId: account.userId,
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
    onlyOneCheckout: boolean;
    loginEmail: string;
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
    imapHost: string;
    imapPort: number;
    imapSecurity: string;
    status: "active" | "locked" | "banned";
    encryptedPassword?: string;
    encryptionIv?: string;
    encryptedLoginPassword?: string | null;
    loginPasswordIv?: string | null;
  } = {
    billingSameAsShipping: parsed.data.billingSameAsShipping ?? true,
    label: parsed.data.label,
    retailer: parsed.data.retailer,
    email: parsed.data.email,
    emailProvider: parsed.data.emailProvider ?? null,
    onlyOneCheckout: parsed.data.onlyOneCheckout ?? true,
    loginEmail: parsed.data.loginEmail,
    shippingName: parsed.data.shippingName ?? null,
    shippingPhone: parsed.data.shippingPhone ?? null,
    shippingAddr: parsed.data.shippingAddr ?? null,
    shippingCity: parsed.data.shippingCity ?? null,
    shippingState: parsed.data.shippingState ?? null,
    shippingZip: parsed.data.shippingZip ?? null,
    billingName: (parsed.data.billingSameAsShipping ?? true) ? null : (parsed.data.billingName ?? null),
    billingPhone: (parsed.data.billingSameAsShipping ?? true) ? null : (parsed.data.billingPhone ?? null),
    billingAddr: (parsed.data.billingSameAsShipping ?? true) ? null : (parsed.data.billingAddr ?? null),
    billingCity: (parsed.data.billingSameAsShipping ?? true) ? null : (parsed.data.billingCity ?? null),
    billingState: (parsed.data.billingSameAsShipping ?? true) ? null : (parsed.data.billingState ?? null),
    billingZip: (parsed.data.billingSameAsShipping ?? true) ? null : (parsed.data.billingZip ?? null),
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

  let account;

  if (parsed.data.retailerLogins && parsed.data.retailerLogins.length > 0) {
    const existingLogins = await prisma.acoRetailerLogin.findMany({
      where: { acoAccountId: context.params.id },
      orderBy: { createdAt: "asc" },
    });

    let mergedRetailerLogins;

    mergedRetailerLogins = parsed.data.retailerLogins.map((entry, index) => {
        const existing = existingLogins[index];
        let encryptedLoginPassword = existing?.encryptedLoginPassword;
        let loginPasswordIv = existing?.loginPasswordIv;

        if (entry.loginPassword && entry.loginPassword.trim().length > 0) {
          const encrypted = encryptImapPassword(entry.loginPassword);
          encryptedLoginPassword = encrypted.encryptedPassword;
          loginPasswordIv = encrypted.encryptionIv;
        }

        return {
          retailer: entry.retailer,
          loginEmail: entry.loginEmail,
          encryptedLoginPassword,
          loginPasswordIv,
        };
      });

    const primary = mergedRetailerLogins[0];
    nextData.retailer = primary.retailer;
    nextData.loginEmail = primary.loginEmail;
    nextData.encryptedLoginPassword = primary.encryptedLoginPassword;
    nextData.loginPasswordIv = primary.loginPasswordIv;

    account = await prisma.$transaction(async (tx) => {
      await tx.acoRetailerLogin.deleteMany({ where: { acoAccountId: context.params.id } });
      await tx.acoRetailerLogin.createMany({
        data: mergedRetailerLogins.map((entry) => ({
          acoAccountId: context.params.id,
          retailer: entry.retailer,
          loginEmail: entry.loginEmail,
          encryptedLoginPassword: entry.encryptedLoginPassword,
          loginPasswordIv: entry.loginPasswordIv,
        })),
      });

      return tx.acoAccount.update({
        where: { id: context.params.id },
        data: nextData,
        select: {
          id: true,
          userId: true,
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
  } else {
    account = await prisma.acoAccount.update({
      where: { id: context.params.id },
      data: nextData,
      select: {
        id: true,
        userId: true,
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
  }

  let syncWarning: string | null = null;

  try {
    await upsertGoogleSheetShippingFields({
      accountId: account.id,
      label: account.label,
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
        ? `Account updated, but Google Sheets sync failed: ${error.message}`
        : "Account updated, but Google Sheets sync failed.";
  }

  return NextResponse.json({ data: sanitizeAcoAccount(account), warning: syncWarning });
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