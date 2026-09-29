import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/api-auth";
import { cardInclude, cardLabelSchema, relayCardToAccount } from "@/lib/aco-library";
import { deleteCardVaultRow, getCardVaultRow, upsertCardVaultRow } from "@/lib/google-sheets-relay";
import { getCardLast4, normalizeCardNumber, normalizeExpirationYear, paymentInfoSchema } from "@/lib/payment-info";

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

  const existing = await prisma.acoCard.findFirst({
    where: { id: context.params.id, userId: authContext.userId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const label = cardLabelSchema.safeParse(body?.label);
  if (!label.success) {
    return NextResponse.json({ error: "Enter a card name." }, { status: 400 });
  }

  const duplicate = await prisma.acoCard.findFirst({
    where: { userId: authContext.userId, id: { not: existing.id }, label: { equals: label.data, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: `A card named "${label.data}" already exists.` }, { status: 409 });
  }

  // Card number and CVV are optional on edit; fall back to the vaulted values.
  const providedNumber = typeof body?.cardNumber === "string" && body.cardNumber.trim() ? body.cardNumber : null;
  const providedCvv = typeof body?.cvv === "string" && body.cvv.trim() ? body.cvv : null;
  let vault;
  try {
    vault = providedNumber && providedCvv ? null : await getCardVaultRow(existing.id);
  } catch (error) {
    return NextResponse.json(
      { error: "Could not read the secure Google Sheets vault", detail: error instanceof Error ? error.message : undefined },
      { status: 502 },
    );
  }
  if (!(providedNumber && providedCvv) && !vault) {
    return NextResponse.json({ error: "Stored card details were not found. Enter the full card number and CVV." }, { status: 409 });
  }

  const parsed = paymentInfoSchema.safeParse({
    ...body,
    cardNumber: providedNumber ?? vault?.cardNumber,
    cvv: providedCvv ?? vault?.cvv,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
  }

  const cardNumber = normalizeCardNumber(parsed.data.cardNumber);
  const entry = {
    cardholderName: parsed.data.cardholderName,
    cardBrand: parsed.data.cardBrand,
    cardNumber,
    expMonth: parsed.data.expMonth,
    expYear: normalizeExpirationYear(parsed.data.expYear),
    cvv: parsed.data.cvv,
  };

  try {
    await upsertCardVaultRow(existing.id, entry);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to store card in the secure Google Sheets vault", detail: error instanceof Error ? error.message : undefined },
      { status: 502 },
    );
  }

  const card = await prisma.acoCard.update({
    where: { id: existing.id },
    data: {
      label: label.data,
      cardholderName: entry.cardholderName,
      cardBrand: entry.cardBrand,
      last4: getCardLast4(cardNumber),
      expMonth: entry.expMonth,
      expYear: entry.expYear,
    },
    include: cardInclude,
  });

  const targets = [
    ...card.accounts.map((account) => ({ account, retailer: null as string | null })),
    ...card.retailerCards.map((link) => ({ account: link.acoAccount, retailer: link.retailer })),
  ];
  const warnings: string[] = [];
  for (const { account, retailer } of targets) {
    try {
      await relayCardToAccount(account.id, card, entry, retailer);
    } catch (error) {
      warnings.push(`#${account.accountNumber}${retailer ? ` (${retailer})` : ""}: card sync failed (${error instanceof Error ? error.message : "unknown error"}).`);
    }
  }

  return NextResponse.json({ data: card, warning: warnings.length ? warnings.join(" ") : null });
}

export async function DELETE(_request: Request, context: RouteParams) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const card = await prisma.acoCard.findFirst({
    where: { id: context.params.id, userId: authContext.userId },
    select: { id: true, _count: { select: { accounts: true, retailerCards: true } } },
  });
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
  if (card._count.accounts > 0 || card._count.retailerCards > 0) {
    return NextResponse.json({ error: "Unlink this card from all accounts before deleting it." }, { status: 409 });
  }

  try {
    await deleteCardVaultRow(card.id);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to remove card from the secure Google Sheets vault", detail: error instanceof Error ? error.message : undefined },
      { status: 502 },
    );
  }

  await prisma.acoCard.delete({ where: { id: card.id } });
  return NextResponse.json({ data: null });
}
