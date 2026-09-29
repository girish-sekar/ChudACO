import { prisma } from "@chudaco/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDiscordIds, getAuthenticatedContext } from "@/lib/api-auth";
import {
  fetchDiscordSuccessMessages,
  parseUsernameFromProfile,
  resolveDiscordUsername,
  type ParsedSuccessMessage,
} from "@/lib/discord-success";

const querySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

const MATCH_WINDOW_MS = 10 * 60 * 1000;
const PRICE_MATCH_EPSILON = 0.01;

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeRetailerKey(retailer: string): string {
  return retailer.trim().toLowerCase();
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

  const retailerMap = new Map<string, { label: string; count: number; volume: number }>();
  const itemMap = new Map<string, { count: number; volume: number }>();
  const dayMap = new Map<string, { count: number; volume: number }>();
  const buyerMap = new Map<string, { username: string; count: number; volume: number }>();

  let totalVolume = 0;
  const uniqueRetailers = new Set<string>();

  for (const checkout of checkouts) {
    const price = Number(checkout.price);
    totalVolume += price;
    const retailerKey = normalizeRetailerKey(checkout.retailer);
    uniqueRetailers.add(retailerKey);

    const retailerEntry = retailerMap.get(retailerKey) ?? { label: checkout.retailer, count: 0, volume: 0 };
    retailerEntry.count += 1;
    retailerEntry.volume += price;
    retailerMap.set(retailerKey, retailerEntry);

    const itemQuantity = parseItemQuantity(checkout.qtyLabel);
    const itemEntry = itemMap.get(checkout.item) ?? { count: 0, volume: 0 };
    itemEntry.count += itemQuantity;
    itemEntry.volume += price * itemQuantity;
    itemMap.set(checkout.item, itemEntry);

    const dayKey = toDayKey(checkout.occurredAt);
    const dayEntry = dayMap.get(dayKey) ?? { count: 0, volume: 0 };
    dayEntry.count += 1;
    dayEntry.volume += price;
    dayMap.set(dayKey, dayEntry);

    const buyerEntry = buyerMap.get(checkout.userId) ?? {
      username: checkout.user.username,
      count: 0,
      volume: 0,
    };
    buyerEntry.count += 1;
    buyerEntry.volume += price;
    buyerMap.set(checkout.userId, buyerEntry);
  }

  const byRetailer = Array.from(retailerMap.values())
    .map((stats) => ({ retailer: stats.label, count: stats.count, volume: stats.volume.toFixed(2) }))
    .sort((a, b) => b.count - a.count);

  const reconciliation = await reconcileWithDiscord(from, to, checkouts);

  // Gap entries count toward top-line totals, the daily chart, and top items too; unresolved
  // ones are keyed/labeled by their raw Discord profile name since there's no matching User
  // to attribute them to.
  let combinedVolume = totalVolume;
  let combinedCount = checkouts.length;
  const combinedRetailers = new Set(uniqueRetailers);
  const combinedBuyerMap = new Map(buyerMap);
  const combinedDayMap = new Map(dayMap);
  const combinedItemMap = new Map(itemMap);

  if (reconciliation.configured) {
    for (const gap of reconciliation.gaps) {
      const price = Number(gap.price);
      combinedCount += 1;
      combinedVolume += price;
      if (gap.retailer) {
        combinedRetailers.add(normalizeRetailerKey(gap.retailer));
      }

      const buyerKey = gap.userId ?? `discord:${gap.profile}`;
      const buyerEntry = combinedBuyerMap.get(buyerKey) ?? {
        username: gap.username,
        count: 0,
        volume: 0,
      };
      buyerEntry.count += 1;
      buyerEntry.volume += price;
      combinedBuyerMap.set(buyerKey, buyerEntry);

      const itemQuantity = parseItemQuantity(gap.quantity);
      const itemEntry = combinedItemMap.get(gap.item) ?? { count: 0, volume: 0 };
      itemEntry.count += itemQuantity;
      itemEntry.volume += price * itemQuantity;
      combinedItemMap.set(gap.item, itemEntry);

      const dayKey = toDayKey(new Date(gap.occurredAt));
      const dayEntry = combinedDayMap.get(dayKey) ?? { count: 0, volume: 0 };
      dayEntry.count += 1;
      dayEntry.volume += price;
      combinedDayMap.set(dayKey, dayEntry);
    }
  }

  const byDay = Array.from(combinedDayMap.entries())
    .map(([date, stats]) => ({ date, count: stats.count, volume: stats.volume.toFixed(2) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byItem = Array.from(combinedItemMap.entries())
    .map(([item, stats]) => ({ item, count: stats.count, volume: stats.volume.toFixed(2) }))
    .sort((a, b) => b.count - a.count)
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

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      successfulCheckouts: combinedCount,
      totalDollarVolume: combinedVolume.toFixed(2),
      averageOrderValue: (combinedCount > 0 ? combinedVolume / combinedCount : 0).toFixed(2),
      uniqueBuyers: combinedBuyerMap.size,
      uniqueRetailers: combinedRetailers.size,
    },
    byRetailer,
    byItem,
    byDay,
    topBuyers,
    recent: checkouts.slice(0, 50).map((checkout) => ({
      ...checkout,
      price: checkout.price.toString(),
      user: checkout.user,
      acoAccount: checkout.acoAccount,
    })),
    reconciliation,
  });
}

type CheckoutForMatch = {
  acoAccountId: string | null;
  userId: string;
  item: string;
  price: unknown;
  occurredAt: Date;
};

function isAlreadyRecorded(
  message: ParsedSuccessMessage,
  matchedAcoAccountId: string | null,
  matchedUserId: string | null,
  checkouts: CheckoutForMatch[],
): boolean {
  return checkouts.some((checkout) => {
    if (matchedAcoAccountId && checkout.acoAccountId !== matchedAcoAccountId) {
      return false;
    }
    if (!matchedAcoAccountId && matchedUserId && checkout.userId !== matchedUserId) {
      return false;
    }
    if (checkout.item.trim().toLowerCase() !== message.item.trim().toLowerCase()) {
      return false;
    }
    if (Math.abs(Number(checkout.price) - message.price) > PRICE_MATCH_EPSILON) {
      return false;
    }
    return Math.abs(checkout.occurredAt.getTime() - message.occurredAt.getTime()) <= MATCH_WINDOW_MS;
  });
}

// Reads the #success channel for the same range and flags checkouts that never made it
// into the database (e.g. the profile name didn't match a registered ACO account).
async function reconcileWithDiscord(from: Date, to: Date, checkouts: CheckoutForMatch[]) {
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
          retailer: true,
          user: { select: { id: true, username: true } },
        },
      })
    : [];
  const accountByProfile = new Map(accounts.map((account) => [account.botProfileName, account]));

  const usernameResolutionCache = new Map<string, string | null>();
  const gaps: Array<{
    messageId: string;
    occurredAt: string;
    profile: string;
    item: string;
    quantity: string;
    price: string;
    retailer: string | null;
    userId: string | null;
    username: string;
    resolved: boolean;
  }> = [];

  let matchedInDatabase = 0;

  for (const message of messages) {
    const account = accountByProfile.get(message.profile);
    let userId = account?.user.id ?? null;
    let username = account?.user.username ?? null;

    if (!account) {
      const parsedUsername = parseUsernameFromProfile(message.profile);
      if (parsedUsername) {
        if (!usernameResolutionCache.has(parsedUsername)) {
          const resolved = await resolveDiscordUsername(parsedUsername);
          const user = resolved
            ? await prisma.user.findUnique({
                where: { discordId: resolved.discordId },
                select: { id: true, username: true },
              })
            : null;
          usernameResolutionCache.set(parsedUsername, user?.id ?? null);
          if (user) {
            username = user.username;
          }
        }
        userId = usernameResolutionCache.get(parsedUsername) ?? null;
        if (userId && !username) {
          const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
          username = user?.username ?? null;
        }
      }
    }

    if (isAlreadyRecorded(message, account?.id ?? null, userId, checkouts)) {
      matchedInDatabase += 1;
      continue;
    }

    gaps.push({
      messageId: message.messageId,
      occurredAt: message.occurredAt.toISOString(),
      profile: message.profile,
      item: message.item,
      quantity: message.quantity,
      price: message.price.toFixed(2),
      retailer: account?.retailer ?? null,
      userId,
      // Fall back to the raw Discord profile name so every gap has a displayable buyer.
      username: username ?? message.profile,
      resolved: Boolean(userId),
    });
  }

  const gapVolume = gaps.reduce((sum, gap) => sum + Number(gap.price), 0);

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
    gapCount: gaps.length,
    gapVolume: gapVolume.toFixed(2),
    resolvedGapCount: gaps.filter((gap) => gap.resolved).length,
    unresolvedGapCount: gaps.filter((gap) => !gap.resolved).length,
    gaps: gaps.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
  };
}
