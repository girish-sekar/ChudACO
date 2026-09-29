import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/api-auth";
import { cardInclude, cardLabelSchema } from "@/lib/aco-library";
import { upsertCardVaultRow } from "@/lib/google-sheets-relay";
import { getCardLast4, normalizeCardNumber, normalizeExpirationYear, paymentInfoSchema } from "@/lib/payment-info";

export async function GET() {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cards = await prisma.acoCard.findMany({
    where: { userId: authContext.userId },
    include: cardInclude,
    orderBy: { label: "asc" },
  });

  return NextResponse.json({ data: cards });
}

export async function POST(request: Request) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const label = cardLabelSchema.safeParse(body?.label);
  const parsed = paymentInfoSchema.safeParse(body);
  if (!label.success || !parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: (label.success ? parsed.error : label.error)?.flatten() },
      { status: 400 },
    );
  }

  const duplicate = await prisma.acoCard.findFirst({
    where: { userId: authContext.userId, label: { equals: label.data, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: `A card named "${label.data}" already exists.` }, { status: 409 });
  }

  const cardNumber = normalizeCardNumber(parsed.data.cardNumber);
  const expYear = normalizeExpirationYear(parsed.data.expYear);
  const card = await prisma.acoCard.create({
    data: {
      userId: authContext.userId,
      label: label.data,
      cardholderName: parsed.data.cardholderName,
      cardBrand: parsed.data.cardBrand,
      last4: getCardLast4(cardNumber),
      expMonth: parsed.data.expMonth,
      expYear,
    },
    include: cardInclude,
  });

  try {
    await upsertCardVaultRow(card.id, {
      cardholderName: parsed.data.cardholderName,
      cardBrand: parsed.data.cardBrand,
      cardNumber,
      expMonth: parsed.data.expMonth,
      expYear,
      cvv: parsed.data.cvv,
    });
  } catch (error) {
    await prisma.acoCard.delete({ where: { id: card.id } });
    return NextResponse.json(
      { error: "Failed to store card in the secure Google Sheets vault", detail: error instanceof Error ? error.message : undefined },
      { status: 502 },
    );
  }

  return NextResponse.json({ data: card }, { status: 201 });
}
