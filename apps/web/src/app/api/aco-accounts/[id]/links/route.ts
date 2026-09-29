import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/api-auth";
import {
  imapAccountData,
  profileAccountData,
  relayCardToAccount,
  removeCardFromAccount,
  syncAccountSheet,
} from "@/lib/aco-library";
import { getCardVaultRow } from "@/lib/google-sheets-relay";

const linksSchema = z.object({
  profileId: z.string().min(1).nullable().optional(),
  imapConfigId: z.string().min(1).nullable().optional(),
  cardId: z.string().min(1).nullable().optional(),
  // Retailer name -> library card id; null falls back to the default card.
  retailerCards: z.record(z.string().trim().min(1), z.string().min(1).nullable()).optional(),
});

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

  const parsed = linksSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
  }

  const account = await prisma.acoAccount.findFirst({
    where: { id: context.params.id, userId: authContext.userId },
    select: {
      id: true,
      retailer: true,
      profileId: true,
      imapConfigId: true,
      cardId: true,
      retailerLogins: { select: { retailer: true } },
      retailerCards: { select: { retailer: true, cardId: true } },
    },
  });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const { profileId, imapConfigId, cardId } = parsed.data;
  const profileChanged = profileId !== undefined && profileId !== account.profileId;
  const imapChanged = imapConfigId !== undefined && imapConfigId !== account.imapConfigId;
  const cardChanged = cardId !== undefined && cardId !== account.cardId;

  const accountRetailers = [account.retailer, ...account.retailerLogins.map((login) => login.retailer)];
  const retailerChanges: Array<{ retailer: string; cardId: string | null }> = [];
  for (const [requestedRetailer, requestedCardId] of Object.entries(parsed.data.retailerCards ?? {})) {
    const retailer = accountRetailers.find((entry) => entry.toLowerCase() === requestedRetailer.toLowerCase());
    if (!retailer) {
      return NextResponse.json({ error: `This account has no ${requestedRetailer} login.` }, { status: 400 });
    }
    const current = account.retailerCards.find((card) => card.retailer.toLowerCase() === retailer.toLowerCase());
    // A retailer card that isn't from the library is left alone unless a library card replaces it.
    if (requestedCardId === (current?.cardId ?? null)) continue;
    if (requestedCardId === null && current && current.cardId === null) continue;
    retailerChanges.push({ retailer: current?.retailer ?? retailer, cardId: requestedCardId });
  }

  const requestedCardIds = Array.from(new Set([
    ...(cardChanged && cardId ? [cardId] : []),
    ...retailerChanges.flatMap((change) => change.cardId ? [change.cardId] : []),
  ]));
  const libraryCards = await prisma.acoCard.findMany({
    where: { id: { in: requestedCardIds }, userId: authContext.userId },
  });
  if (libraryCards.length !== requestedCardIds.length) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
  const cardById = new Map(libraryCards.map((card) => [card.id, card]));

  const profile = profileChanged && profileId
    ? await prisma.acoProfile.findFirst({ where: { id: profileId, userId: authContext.userId } })
    : null;
  if (profileChanged && profileId && !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const imap = imapChanged && imapConfigId
    ? await prisma.acoImapConfig.findFirst({ where: { id: imapConfigId, userId: authContext.userId } })
    : null;
  if (imapChanged && imapConfigId && !imap) {
    return NextResponse.json({ error: "IMAP inbox not found" }, { status: 404 });
  }

  if (profileChanged || imapChanged) {
    await prisma.acoAccount.update({
      where: { id: account.id },
      data: {
        ...(profileChanged ? { profileId: profile?.id ?? null, ...profileAccountData(profile) } : {}),
        ...(imapChanged ? { imapConfigId: imap?.id ?? null, ...imapAccountData(imap) } : {}),
      },
    });
  }

  const warnings: string[] = [];

  const cardChanges = [
    ...(cardChanged ? [{ retailer: null as string | null, cardId: cardId ?? null }] : []),
    ...retailerChanges,
  ];
  for (const change of cardChanges) {
    const libraryCard = change.cardId ? cardById.get(change.cardId)! : null;
    const scope = change.retailer ?? "default";
    try {
      if (libraryCard) {
        const vault = await getCardVaultRow(libraryCard.id);
        if (!vault) {
          throw new Error(`Stored details for card "${libraryCard.label}" were not found. Re-enter the card number and CVV in Cards.`);
        }
        await relayCardToAccount(account.id, libraryCard, vault, change.retailer);
      } else {
        await removeCardFromAccount(account.id, change.retailer);
      }
      if (change.retailer === null) {
        await prisma.acoAccount.update({ where: { id: account.id }, data: { cardId: libraryCard?.id ?? null } });
      }
    } catch (error) {
      return NextResponse.json(
        {
          error: `Could not ${libraryCard ? "link" : "unlink"} the ${scope} card.`,
          detail: error instanceof Error ? error.message : undefined,
        },
        { status: 502 },
      );
    }
  }

  if (profileChanged || imapChanged) {
    const warning = await syncAccountSheet(account.id);
    if (warning) warnings.push(warning);
  }

  const updated = await prisma.acoAccount.findUniqueOrThrow({
    where: { id: account.id },
    select: {
      id: true,
      profileId: true,
      imapConfigId: true,
      cardId: true,
      retailerCards: { select: { retailer: true, cardId: true } },
    },
  });

  return NextResponse.json({ data: updated, warning: warnings.length ? warnings.join(" ") : null });
}
