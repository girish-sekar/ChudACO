import { prisma } from "@chudaco/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDiscordIds, getAuthenticatedContext } from "@/lib/api-auth";
import {
  resolveDropSummaryOrderPrice,
  type DropSummaryPricingRule,
} from "@/lib/drop-summary-pricing";
import {
  fetchDiscordSuccessMessages,
  normalizeProfileName,
  parseUsernameFromProfile,
  resolveDiscordDisplayName,
  resolveDiscordUsername,
  type ParsedSuccessMessage,
} from "@/lib/discord-success";

const querySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

const MATCH_WINDOW_MS = 10 * 60 * 1000;
const PRICE_MATCH_EPSILON = 0.01;
const UNMAPPED_BUYER_DISCORD_ID = "346422586931937280";

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeRetailerKey(retailer: string): string {
  return retailer.trim().toLowerCase();
}

function profileUsernameCandidate(profile: string): string | null {
  const parsed = parseUsernameFromProfile(profile);
  if (parsed) return parsed;
  const firstToken = normalizeProfileName(profile).split(/\s+/)[0];
  return firstToken || null;
}

function normalizeItemName(item: string): string {
  return item
    .replace(/^\[([\s\S]+)\]\(https?:\/\/[^)]+\)$/i, "$1")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/\s+-\s+\$[0-9][0-9,]*(?:\.[0-9]{2})?\s*$/, "")
    .trim();
}

function parseItemQuantity(value: string | null | undefined): number {
  const match = value?.match(/\d+/);
  const quantity = match ? Number.parseInt(match[0], 10) : 0;
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1;
}

export async function GET(request: NextRequest) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admins = getAdminDiscordIds();
  if (!admins.has(authContext.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = querySchema.safeParse({
    from: request.nextUrl.searchParams.get("from") ?? undefined,
    to: request.nextUrl.searchParams.get("to") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const from = new Date(parsed.data.from);
  const to = new Date(parsed.data.to);

  const checkouts = await prisma.checkout.findMany({
    where: {
      status: "success",
      occurredAt: { gte: from, lte: to },
    },
    orderBy: { occurredAt: "desc" },
    include: {
      user: { select: { id: true, username: true, discordId: true } },
      acoAccount: { select: { id: true, label: true } },
    },
  });
  const pricingRules = await prisma.pricingRule.findMany({
    select: { category: true, priceRangeLabel: true },
  });
  const reconciliation = await reconcileWithDiscord(from, to, checkouts, pricingRules);
  const useDiscordSource = reconciliation.configured && !reconciliation.error;
  const summaryCheckouts: SummaryCheckout[] = useDiscordSource
    ? reconciliation.successes.map((success) => ({
        id: success.messageId,
        acoAccountId: success.account?.id ?? success.matchedCheckout?.acoAccountId ?? null,
        userId: success.buyerKey,
        item: success.item,
        qtyLabel: success.quantity,
        retailer: success.retailer ?? "",
        price: success.orderPrice ?? 0,
        occurredAt: new Date(success.occurredAt),
        user: {
          id: success.buyerKey,
          username: success.username,
          discordId: success.discordUserId ?? "",
        },
        acoAccount: success.account ?? success.matchedCheckout?.acoAccount ?? null,
        imageUrl: success.imageUrl,
        sourceOrderPrice: success.orderPrice,
        sourceBuyerKey: success.buyerKey,
      }))
    : checkouts;

  const retailerMap = new Map<string, { label: string; count: number; volume: number }>();
  const itemMap = new Map<string, { count: number; volume: number; pricedCount: number; imageUrl: string | null }>();
  const dayMap = new Map<string, { count: number; volume: number }>();
  const buyerMap = new Map<string, { username: string; count: number; volume: number }>();

  let totalVolume = 0;
  let pricedCheckoutCount = 0;
  const uniqueRetailers = new Set<string>();

  for (const checkout of summaryCheckouts) {
    const itemQuantity = parseItemQuantity(checkout.qtyLabel);
    const orderPrice = checkout.sourceOrderPrice !== undefined
      ? checkout.sourceOrderPrice ?? 0
      : resolveDropSummaryOrderPrice(
          checkout.item,
          checkout.retailer,
          itemQuantity,
          pricingRules,
          Number(checkout.price),
        ) ?? 0;
    totalVolume += orderPrice;
    if (orderPrice > 0) {
      pricedCheckoutCount += 1;
    }
    if (checkout.retailer) {
      const retailerKey = normalizeRetailerKey(checkout.retailer);
      uniqueRetailers.add(retailerKey);

      const retailerEntry = retailerMap.get(retailerKey) ?? { label: checkout.retailer, count: 0, volume: 0 };
      retailerEntry.count += 1;
      retailerEntry.volume += orderPrice;
      retailerMap.set(retailerKey, retailerEntry);
    }

    const itemName = normalizeItemName(checkout.item);
    const itemEntry = itemMap.get(itemName) ?? { count: 0, volume: 0, pricedCount: 0, imageUrl: null };
    itemEntry.count += itemQuantity;
    itemEntry.volume += orderPrice;
    if (orderPrice > 0) {
      itemEntry.pricedCount += itemQuantity;
    }
    itemMap.set(itemName, itemEntry);

    const dayKey = toDayKey(checkout.occurredAt);
    const dayEntry = dayMap.get(dayKey) ?? { count: 0, volume: 0 };
    dayEntry.count += 1;
    dayEntry.volume += orderPrice;
    dayMap.set(dayKey, dayEntry);

    const buyerKey = checkout.sourceBuyerKey ?? checkout.userId;
    const buyerEntry = buyerMap.get(buyerKey) ?? {
      username: checkout.user.username,
      count: 0,
      volume: 0,
    };
    buyerEntry.count += 1;
    buyerEntry.volume += orderPrice;
    buyerMap.set(buyerKey, buyerEntry);
  }

  const byRetailer = Array.from(retailerMap.values())
    .map((stats) => ({ retailer: stats.label, count: stats.count, volume: stats.volume.toFixed(2) }))
    .sort((a, b) => b.count - a.count);

  const reconciledProductImages = new Map(
    reconciliation.configured
      ? reconciliation.productImages.map((productImage) => [normalizeItemName(productImage.item), productImage.imageUrl])
      : [],
  );

  // Gap entries count toward top-line totals, the daily chart, and top items too; unresolved
  // buyers are attributed to the designated fallback user.
  const combinedVolume = totalVolume;
  const combinedCount = summaryCheckouts.length;
  const combinedPricedCount = pricedCheckoutCount;
  const combinedRetailers = new Set(uniqueRetailers);
  const combinedBuyerMap = new Map(buyerMap);
  const combinedDayMap = new Map(dayMap);
  const combinedItemMap = new Map(itemMap);

  if (reconciliation.configured) {
    for (const productImage of reconciliation.productImages) {
      const itemEntry = combinedItemMap.get(normalizeItemName(productImage.item));
      if (itemEntry && !itemEntry.imageUrl) itemEntry.imageUrl = productImage.imageUrl;
    }
  }

  const byDay = Array.from(combinedDayMap.entries())
    .map(([date, stats]) => ({ date, count: stats.count, volume: stats.volume.toFixed(2) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byItem = Array.from(combinedItemMap.entries())
    .map(([item, stats]) => ({
      item,
      imageUrl: stats.imageUrl,
      count: stats.count,
      pricedCount: stats.pricedCount,
      volume: stats.volume.toFixed(2),
    }))
    .sort((a, b) => Number(b.volume) - Number(a.volume))
    .slice(0, 20);

  const topBuyers = Array.from(combinedBuyerMap.entries())
    .map(([userId, stats]) => ({
      userId,
      username: stats.username,
      count: stats.count,
      volume: stats.volume.toFixed(2),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const buyerUsers = await prisma.user.findMany({
    where: { id: { in: topBuyers.map((buyer) => buyer.userId).filter((userId) => !userId.startsWith("discord:")) } },
    select: { id: true, discordId: true },
  });
  const buyerDiscordIds = new Map(buyerUsers.map((user) => [user.id, user.discordId]));
  await Promise.all(topBuyers.map(async (buyer) => {
    const discordId = buyer.userId.startsWith("discord:")
      ? buyer.userId.slice("discord:".length)
      : buyerDiscordIds.get(buyer.userId);
    if (!discordId) return;
    buyer.username = (await resolveDiscordDisplayName(discordId)) ?? buyer.username;
  }));

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    sourceOfTruth: useDiscordSource ? "discord" : "database",
    totals: {
      successfulCheckouts: combinedCount,
      totalDollarVolume: combinedVolume.toFixed(2),
      averageOrderValue: (combinedPricedCount > 0 ? combinedVolume / combinedPricedCount : 0).toFixed(2),
      uniqueBuyers: combinedBuyerMap.size,
      uniqueRetailers: combinedRetailers.size,
    },
    byRetailer,
    byItem,
    byDay,
    topBuyers,
    recent: summaryCheckouts.slice(0, 50).map((checkout) => ({
      ...checkout,
      imageUrl: reconciledProductImages.get(normalizeItemName(checkout.item)) ?? null,
      price: (checkout.sourceOrderPrice !== undefined
        ? checkout.sourceOrderPrice
        : resolveDropSummaryOrderPrice(
            checkout.item,
            checkout.retailer,
            parseItemQuantity(checkout.qtyLabel),
            pricingRules,
            Number(checkout.price),
          )
      )?.toFixed(2) ?? "0.00",
      user: checkout.user,
      acoAccount: checkout.acoAccount,
    })),
    reconciliation,
  });
}

type CheckoutForMatch = {
  id: string;
  acoAccountId: string | null;
  userId: string;
  item: string;
  qtyLabel: string;
  retailer: string;
  price: unknown;
  occurredAt: Date;
  imageUrl?: string | null;
  user: { id: string; username: string; discordId: string };
  acoAccount: { id: string; label: string } | null;
};

type SummaryCheckout = CheckoutForMatch & {
  sourceOrderPrice?: number | null;
  sourceBuyerKey?: string;
};

function findMatchingCheckout(
  message: ParsedSuccessMessage,
  matchedAcoAccountId: string | null,
  matchedUserId: string | null,
  checkouts: CheckoutForMatch[],
  pricingRules: DropSummaryPricingRule[],
  matchedCheckoutIds: Set<string>,
): CheckoutForMatch | null {
  if (!matchedAcoAccountId && !matchedUserId) {
    return null;
  }

  const matches = checkouts.filter((checkout) => {
    if (matchedCheckoutIds.has(checkout.id)) {
      return false;
    }
    if (matchedAcoAccountId && checkout.acoAccountId !== matchedAcoAccountId) {
      return false;
    }
    if (!matchedAcoAccountId && matchedUserId && checkout.userId !== matchedUserId) {
      return false;
    }
    if (normalizeItemName(checkout.item).toLowerCase() !== normalizeItemName(message.item).toLowerCase()) {
      return false;
    }
    if (message.price !== null && message.price > 0) {
      const checkoutPrice =
        resolveDropSummaryOrderPrice(
          checkout.item,
          checkout.retailer,
          parseItemQuantity(checkout.qtyLabel),
          pricingRules,
          Number(checkout.price),
        );
      if (checkoutPrice === null || Math.abs(checkoutPrice - message.price) > PRICE_MATCH_EPSILON) {
        return false;
      }
    }
    return Math.abs(checkout.occurredAt.getTime() - message.occurredAt.getTime()) <= MATCH_WINDOW_MS;
  });

  return matches.sort((first, second) =>
    Math.abs(first.occurredAt.getTime() - message.occurredAt.getTime())
    - Math.abs(second.occurredAt.getTime() - message.occurredAt.getTime()),
  )[0] ?? null;
}

// Reads the #success channel for the same range and flags checkouts that never made it
// into the database (e.g. the profile name didn't match a registered ACO account).
async function reconcileWithDiscord(
  from: Date,
  to: Date,
  checkouts: CheckoutForMatch[],
  pricingRules: DropSummaryPricingRule[],
) {
  const { messages, scanned, error } = await fetchDiscordSuccessMessages(from, to);

  if (error === "not_configured") {
    return { configured: false as const };
  }

  const uniqueProfiles = Array.from(new Set(messages.map((message) => message.profile)));
  const accounts = uniqueProfiles.length
    ? await prisma.acoAccount.findMany({
        where: { botProfileName: { in: uniqueProfiles } },
        select: {
          botProfileName: true,
          id: true,
          label: true,
          retailer: true,
          user: { select: { id: true, username: true, discordId: true } },
        },
      })
    : [];
  const accountByProfile = new Map(accounts.map((account) => [account.botProfileName, account]));
  const parsedUsernames = Array.from(new Set(messages
    .map((message) => profileUsernameCandidate(message.profile))
    .filter((username): username is string => Boolean(username))));
  const profileUsers = parsedUsernames.length
    ? await prisma.user.findMany({
        where: { username: { in: parsedUsernames, mode: "insensitive" } },
        select: { id: true, username: true, discordId: true },
      })
    : [];
  const userByProfileName = new Map(profileUsers.map((user) => [user.username.toLowerCase(), user]));
  const unmappedBuyer = await prisma.user.findUnique({
    where: { discordId: UNMAPPED_BUYER_DISCORD_ID },
    select: { id: true, username: true },
  });
  const productImages = new Map<string, { item: string; imageUrl: string }>();
  for (const message of messages) {
    if (message.imageUrl) {
      const item = normalizeItemName(message.item);
      if (!productImages.has(item)) productImages.set(item, { item, imageUrl: message.imageUrl });
    }
  }

  const usernameResolutionCache = new Map<string, {
    discordId: string;
    userId: string | null;
    username: string | null;
  } | null>();
  const mentionResolutionCache = new Map<string, { id: string; username: string } | null>();
  const gaps: Array<{
    messageId: string;
    occurredAt: string;
    profile: string;
    item: string;
    imageUrl: string | null;
    quantity: string;
    price: string;
    retailer: string | null;
    userId: string | null;
    username: string;
    resolved: boolean;
  }> = [];
  const successes: Array<{
    messageId: string;
    occurredAt: string;
    profile: string;
    item: string;
    imageUrl: string | null;
    quantity: string;
    price: string;
    orderPrice: number | null;
    retailer: string | null;
    userId: string | null;
    buyerKey: string;
    username: string;
    discordUserId: string | null;
    account: { id: string; label: string } | null;
    matchedCheckout: CheckoutForMatch | null;
  }> = [];

  let matchedInDatabase = 0;
  const matchedCheckoutIds = new Set<string>();

  for (const reportedMessage of messages) {
    const message = {
      ...reportedMessage,
      price: resolveDropSummaryOrderPrice(
        reportedMessage.item,
        accountByProfile.get(reportedMessage.profile)?.retailer ?? reportedMessage.retailer ?? "",
        parseItemQuantity(reportedMessage.quantity),
        pricingRules,
        reportedMessage.price,
      ),
    };
    const account = accountByProfile.get(message.profile);
    const parsedUsername = profileUsernameCandidate(message.profile);
    const profileUser = parsedUsername ? userByProfileName.get(parsedUsername.toLowerCase()) : null;
    let userId = account?.user.id ?? profileUser?.id ?? null;
    let username = account?.user.username ?? profileUser?.username ?? null;
    let discordUserId: string | null = account?.user.discordId ?? profileUser?.discordId ?? null;

    const mentionedDiscordId = message.mentionedUser?.id;
    if (mentionedDiscordId) {
      discordUserId = mentionedDiscordId;
      if (!mentionResolutionCache.has(mentionedDiscordId)) {
        const user = await prisma.user.findUnique({
          where: { discordId: mentionedDiscordId },
          select: { id: true, username: true },
        });
        mentionResolutionCache.set(mentionedDiscordId, user);
      }
      const mentionedUser = mentionResolutionCache.get(mentionedDiscordId);
      username = mentionedUser?.username
        ?? message.mentionedUser?.displayName
        ?? message.mentionedUser?.username
        ?? parsedUsername;
      userId = mentionedUser?.id ?? null;
    }

    if (parsedUsername && (!discordUserId || !userId)) {
      if (!usernameResolutionCache.has(parsedUsername)) {
        const resolved = await resolveDiscordUsername(parsedUsername);
        const user = resolved
          ? await prisma.user.findUnique({
              where: { discordId: resolved.discordId },
              select: { id: true, username: true },
            })
          : null;
        usernameResolutionCache.set(parsedUsername, resolved
          ? { discordId: resolved.discordId, userId: user?.id ?? null, username: user?.username ?? null }
          : null);
      }
      const resolved = usernameResolutionCache.get(parsedUsername);
      if (resolved) {
        if (!mentionedDiscordId) discordUserId = resolved.discordId;
        userId = resolved.userId ?? userId;
        username = resolved.username ?? username ?? parsedUsername;
      }
    }

    const matchedCheckout = findMatchingCheckout(
      message,
      account?.id ?? null,
      userId,
      checkouts,
      pricingRules,
      matchedCheckoutIds,
    );
    if (matchedCheckout) {
      matchedCheckoutIds.add(matchedCheckout.id);
      matchedInDatabase += 1;
    }

    const mentionedName = message.mentionedUser?.displayName ?? message.mentionedUser?.username ?? null;
    const gapUserId = userId ?? (message.mentionedUser ? null : unmappedBuyer?.id ?? null);
    const gapUsername = username
      ?? mentionedName
      ?? (message.mentionedUser ? parsedUsername : userId ? null : unmappedBuyer?.username)
      ?? parsedUsername
      ?? null;

    const retailer = account?.retailer ?? matchedCheckout?.retailer ?? message.retailer;
    const resolvedMessagePrice = resolveDropSummaryOrderPrice(
      message.item,
      retailer ?? "",
      parseItemQuantity(message.quantity),
      pricingRules,
      reportedMessage.price,
    );
    const backfilledPrice = resolveDropSummaryOrderPrice(
      message.item,
      retailer ?? "",
      parseItemQuantity(message.quantity),
      pricingRules,
    );
    const orderPrice = resolvedMessagePrice !== null && resolvedMessagePrice > 0
      ? resolvedMessagePrice
      : backfilledPrice;
    const messagePrice = orderPrice !== null && orderPrice > 0 ? orderPrice : null;
    const buyerKey = userId
      ?? (discordUserId ? `discord:${discordUserId}` : null)
      ?? unmappedBuyer?.id
      ?? `discord:${parsedUsername?.toLowerCase() ?? message.profile}`;
    const displayUsername = mentionedName
      ?? matchedCheckout?.user.username
      ?? username
      ?? (userId ? null : unmappedBuyer?.username)
      ?? parsedUsername
      ?? message.profile;

    successes.push({
      messageId: message.messageId,
      occurredAt: message.occurredAt.toISOString(),
      profile: message.profile,
      item: message.item,
      imageUrl: message.imageUrl,
      quantity: message.quantity,
      price: messagePrice?.toFixed(2) ?? "unknown",
      orderPrice,
      retailer,
      userId: gapUserId,
      buyerKey,
      username: displayUsername,
      discordUserId,
      account: account ? { id: account.id, label: account.label } : matchedCheckout?.acoAccount ?? null,
      matchedCheckout,
    });

    if (matchedCheckout) {
      continue;
    }

    gaps.push({
      messageId: message.messageId,
      occurredAt: message.occurredAt.toISOString(),
      profile: message.profile,
      item: message.item,
      imageUrl: message.imageUrl,
      quantity: message.quantity,
      price: (messagePrice ?? backfilledPrice)?.toFixed(2) ?? "unknown",
      retailer,
      userId: gapUserId,
      username: gapUsername ?? message.profile,
      resolved: Boolean(discordUserId ?? userId ?? (!message.mentionedUser ? unmappedBuyer?.id : null)),
    });
  }

  const gapVolume = gaps.reduce((sum, gap) => sum + (gap.price === "unknown" ? 0 : Number(gap.price)), 0);

  // Discord silently strips embeds/content from messages the bot doesn't own unless the
  // application has the Message Content privileged intent enabled — this is the #1 cause
  // of "0 successMessagesFound" despite messages existing in the channel.
  const likelyMissingMessageContentIntent = scanned > 0 && messages.length === 0;

  return {
    configured: true as const,
    error,
    likelyMissingMessageContentIntent,
    discordMessagesScanned: scanned,
    successMessagesFound: messages.length,
    matchedInDatabase,
    databaseOnlyCount: checkouts.filter((checkout) => !matchedCheckoutIds.has(checkout.id)).length,
    gapCount: gaps.length,
    gapVolume: gapVolume.toFixed(2),
    unpricedGapCount: gaps.filter((gap) => gap.price === "unknown").length,
    resolvedGapCount: gaps.filter((gap) => gap.resolved).length,
    unresolvedGapCount: gaps.filter((gap) => !gap.resolved).length,
    gaps: gaps.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    successes: successes.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    productImages: Array.from(productImages.values()),
  };
}
