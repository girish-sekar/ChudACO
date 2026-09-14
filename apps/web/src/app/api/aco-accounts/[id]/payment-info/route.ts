import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/api-auth";
import { deleteGoogleSheetRowsForAccount, upsertGoogleSheetAccountRow } from "@/lib/google-sheets-relay";
import {
  buildGoogleSheetRow,
  getCardLast4,
  normalizeExpirationYear,
  normalizeCardNumber,
  paymentInfoSchema,
} from "@/lib/payment-info";

type RouteParams = {
  params: {
    id: string;
  };
};

function sanitizeCardOnFile(card: {
  id: string;
  acoAccountId: string;
  retailer?: string | null;
  cardBrand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  cardholderName: string | null;
  updatedAt: Date;
}) {
  return {
    id: card.id,
    acoAccountId: card.acoAccountId,
    retailer: card.retailer ?? null,
    cardBrand: card.cardBrand,
    last4: card.last4,
    expMonth: card.expMonth,
    expYear: card.expYear,
    cardholderName: card.cardholderName,
    updatedAt: card.updatedAt,
  };
}

export async function GET(request: Request, context: RouteParams) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.acoAccount.findFirst({
    where: { id: context.params.id, userId: authContext.userId },
    select: { id: true },
  });

  if (!account) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const retailer = new URL(request.url).searchParams.get("retailer")?.trim();

  if (retailer) {
    const retailerCard = await prisma.acoRetailerCard.findUnique({
      where: {
        acoAccountId_retailer: {
          acoAccountId: account.id,
          retailer,
        },
      },
    });

    return NextResponse.json({
      data: retailerCard ? sanitizeCardOnFile({ ...retailerCard, retailer: retailerCard.retailer }) : null,
    });
  }

  const card = await prisma.cardOnFile.findUnique({
    where: { acoAccountId: account.id },
  });

  return NextResponse.json({
    data: card ? sanitizeCardOnFile(card) : null,
  });
}

export async function DELETE(request: Request, context: RouteParams) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.acoAccount.findFirst({
    where: { id: context.params.id, userId: authContext.userId },
    select: { id: true },
  });
  if (!account) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || (body.retailer !== null && (typeof body.retailer !== "string" || !body.retailer.trim()))) {
    return NextResponse.json({ error: "Specify a retailer, or null for the default card." }, { status: 400 });
  }
  const retailer: string | null = body.retailer === null ? null : body.retailer.trim();

  try {
    await deleteGoogleSheetRowsForAccount(account.id, retailer);
  } catch {
    return NextResponse.json({ error: "Failed to remove card from Google Sheets. Please retry saving." }, { status: 502 });
  }

  if (retailer === null) {
    await prisma.cardOnFile.deleteMany({ where: { acoAccountId: account.id } });
  } else {
    await prisma.acoRetailerCard.deleteMany({
      where: { acoAccountId: account.id, retailer: { equals: retailer, mode: "insensitive" } },
    });
  }
  return NextResponse.json({ data: null });
}

export async function POST(request: Request, context: RouteParams) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.acoAccount.findFirst({
    where: { id: context.params.id, userId: authContext.userId },
    select: {
      id: true,
      label: true,
      botProfileName: true,
      email: true,
      loginEmail: true,
      onlyOneCheckout: true,
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
    },
  });

  if (!account) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = paymentInfoSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const retailer = typeof body?.retailer === "string" && body.retailer.trim().length > 0 ? body.retailer.trim() : null;
  const normalizedCardNumber = normalizeCardNumber(parsed.data.cardNumber);
  const normalizedExpYear = normalizeExpirationYear(parsed.data.expYear);
  if (normalizedCardNumber.length < 12 || normalizedCardNumber.length > 19) {
    return NextResponse.json({ error: "Invalid card number" }, { status: 400 });
  }

  const profileName = account.botProfileName;
  const emailAddress = account.loginEmail ?? account.email;
  const shippingName = account.shippingName ?? "";
  const shippingPhone = account.shippingPhone ?? "";
  const shippingAddress = account.shippingAddr ?? "";
  const shippingCity = account.shippingCity ?? "";
  const shippingState = account.shippingState ?? "";
  const shippingPostCode = account.shippingZip ?? "";
  const shippingCountry = "US";
  const billingName = account.billingSameAsShipping
    ? shippingName
    : (account.billingName ?? parsed.data.cardholderName);
  const billingPhone = account.billingSameAsShipping
    ? shippingPhone
    : (account.billingPhone ?? "");
  const billingAddress = account.billingSameAsShipping
    ? shippingAddress
    : (account.billingAddr ?? "");
  const billingCity = account.billingSameAsShipping
    ? shippingCity
    : (account.billingCity ?? "");
  const billingState = account.billingSameAsShipping
    ? shippingState
    : (account.billingState ?? "");
  const billingPostCode = account.billingSameAsShipping
    ? shippingPostCode
    : (account.billingZip ?? "");
  const billingCountry = shippingCountry;
  const otherEntriesList = JSON.stringify({
    acoAccountId: account.id,
    retailer,
  });

  const sheetRow = buildGoogleSheetRow({
    emailAddress,
    profileName,
    onlyOneCheckout: account.onlyOneCheckout,
    sameBillingShipping: account.billingSameAsShipping,
    nameOnCard: parsed.data.cardholderName,
    cardType: parsed.data.cardBrand,
    cardNumber: normalizedCardNumber,
    expirationMonth: parsed.data.expMonth,
    expirationYear: normalizedExpYear,
    cvv: parsed.data.cvv,
    shippingName,
    shippingPhone,
    shippingAddress,
    shippingPostCode,
    shippingCity,
    shippingState,
    shippingCountry,
    billingName,
    billingPhone,
    billingAddress,
    billingPostCode,
    billingCity,
    billingState,
    billingCountry,
    otherEntriesList,
    sizeOptional: "",
  });

  try {
    await upsertGoogleSheetAccountRow(account.id, sheetRow);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown Google Sheets error";
    console.error("Google Sheets relay failed", {
      message,
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      sheetName: process.env.GOOGLE_SHEETS_TAB_NAME,
    });

    return NextResponse.json(
      {
        error: "Failed to relay payment info to Google Sheets",
        detail: message,
      },
      { status: 502 },
    );
  }

  const cardRecord = retailer
    ? await prisma.acoRetailerCard.upsert({
        where: {
          acoAccountId_retailer: {
            acoAccountId: account.id,
            retailer,
          },
        },
        update: {
          cardBrand: parsed.data.cardBrand,
          last4: getCardLast4(normalizedCardNumber),
          expMonth: parsed.data.expMonth,
          expYear: normalizedExpYear,
          cardholderName: parsed.data.cardholderName,
        },
        create: {
          acoAccountId: account.id,
          retailer,
          cardBrand: parsed.data.cardBrand,
          last4: getCardLast4(normalizedCardNumber),
          expMonth: parsed.data.expMonth,
          expYear: normalizedExpYear,
          cardholderName: parsed.data.cardholderName,
        },
      })
    : await prisma.cardOnFile.upsert({
        where: { acoAccountId: account.id },
        update: {
          cardBrand: parsed.data.cardBrand,
          last4: getCardLast4(normalizedCardNumber),
          expMonth: parsed.data.expMonth,
          expYear: normalizedExpYear,
          cardholderName: parsed.data.cardholderName,
        },
        create: {
          acoAccountId: account.id,
          cardBrand: parsed.data.cardBrand,
          last4: getCardLast4(normalizedCardNumber),
          expMonth: parsed.data.expMonth,
          expYear: normalizedExpYear,
          cardholderName: parsed.data.cardholderName,
        },
      });

  return NextResponse.json({
    data: sanitizeCardOnFile({
      ...cardRecord,
      acoAccountId: account.id,
      retailer: retailer ?? null,
    }),
  });
}