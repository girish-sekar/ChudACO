import { prisma } from "@chudaco/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/api-auth";
import type { Checkout as DashboardCheckout } from "@/lib/dashboard";
import {
  fetchDiscordSuccessMessages,
  normalizeProfileName,
  parseUsernameFromProfile,
} from "@/lib/discord-success";

const IMAGE_MATCH_WINDOW_MS = 10 * 60 * 1000;

function normalizeItemName(item: string): string {
  return item
    .replace(/^\[([\s\S]+)\]\(https?:\/\/[^)]+\)$/i, "$1")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/\s+-\s+\$[0-9][0-9,]*(?:\.[0-9]{2})?\s*$/, "")
    .trim()
    .toLowerCase();
}

const checkoutQuerySchema = z.object({
  status: z.enum(["success", "failed", "pending"]).optional(),
  q: z.string().trim().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = checkoutQuerySchema.safeParse({
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    q: request.nextUrl.searchParams.get("q") ?? undefined,
    from: request.nextUrl.searchParams.get("from") ?? undefined,
    to: request.nextUrl.searchParams.get("to") ?? undefined,
  });

  if (!query.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        details: query.error.flatten(),
      },
      { status: 400 },
    );
  }

  if (query.data.from && query.data.to && new Date(query.data.from) > new Date(query.data.to)) {
    return NextResponse.json({ error: "The start date must be on or before the end date." }, { status: 400 });
  }

  const checkouts = await prisma.checkout.findMany({
    where: {
      userId: authContext.userId,
      ...(query.data.from || query.data.to
        ? {
            occurredAt: {
              ...(query.data.from ? { gte: new Date(query.data.from) } : {}),
              ...(query.data.to ? { lte: new Date(query.data.to) } : {}),
            },
          }
        : {}),
      ...(query.data.status ? { status: query.data.status } : {}),
      ...(query.data.q
        ? {
            OR: [
              { item: { contains: query.data.q, mode: "insensitive" } },
              { retailer: { contains: query.data.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: {
      occurredAt: "desc",
    },
  });

  const profileByAccountId = new Map<string, string>();
  const accountIds = Array.from(new Set(checkouts.flatMap((checkout) => checkout.acoAccountId ?? [])));
  if (accountIds.length > 0) {
    const accounts = await prisma.acoAccount.findMany({
      where: { id: { in: accountIds }, userId: authContext.userId },
      select: { id: true, botProfileName: true },
    });
    for (const account of accounts) profileByAccountId.set(account.id, account.botProfileName);
  }

  const now = new Date();
  const rangeStart = query.data.from
    ? new Date(query.data.from)
    : checkouts.length
      ? new Date(Math.min(...checkouts.map((checkout) => checkout.occurredAt.getTime())))
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const rangeEnd = query.data.to
    ? new Date(query.data.to)
    : checkouts.length
      ? new Date(Math.max(...checkouts.map((checkout) => checkout.occurredAt.getTime())))
      : now;
  const { messages, error: discordError } = await fetchDiscordSuccessMessages(rangeStart, rangeEnd);

  const imageByCheckoutId = new Map<string, string>();
  if (checkouts.length > 0 && profileByAccountId.size > 0) {
    for (const checkout of checkouts) {
      if (checkout.status !== "success" || !checkout.acoAccountId) continue;
      const profile = profileByAccountId.get(checkout.acoAccountId);
      if (!profile) continue;
      const matchingMessage = messages
        .filter((message) =>
          message.imageUrl &&
          message.profile === profile &&
          normalizeItemName(message.item) === normalizeItemName(checkout.item) &&
          Math.abs(message.occurredAt.getTime() - checkout.occurredAt.getTime()) <= IMAGE_MATCH_WINDOW_MS,
        )
        .sort((a, b) =>
          Math.abs(a.occurredAt.getTime() - checkout.occurredAt.getTime()) -
          Math.abs(b.occurredAt.getTime() - checkout.occurredAt.getTime()),
        )[0];
      if (matchingMessage?.imageUrl) imageByCheckoutId.set(checkout.id, matchingMessage.imageUrl);
    }
  }

  let summarySuccesses: DashboardCheckout[] = checkouts
    .filter((checkout) => checkout.status === "success")
    .map((checkout) => ({
      ...checkout,
      price: checkout.price.toString(),
      occurredAt: checkout.occurredAt.toISOString(),
      imageUrl: null,
    }));
  if (!discordError) {
    const storedUser = await prisma.user.findUnique({
      where: { id: authContext.userId },
      select: { username: true },
    });
    const currentNames = new Set([
      authContext.discordUsername?.trim().toLowerCase(),
      storedUser?.username.trim().toLowerCase(),
    ].filter((name): name is string => Boolean(name)));

    const matchedMessages = messages.filter((message) => {
      if (message.mentionedUser?.id === authContext.discordId) return true;
      const normalizedProfile = normalizeProfileName(message.profile).toLowerCase();
      const profileName = parseUsernameFromProfile(message.profile)?.toLowerCase()
        ?? normalizedProfile.split(/\s+/)[0];
      return currentNames.has(profileName)
        || Array.from(currentNames).some((name) => normalizedProfile.startsWith(`${name} `));
    });
    const accounts = matchedMessages.length
      ? await prisma.acoAccount.findMany({
          where: {
            userId: authContext.userId,
            botProfileName: { in: Array.from(new Set(matchedMessages.map((message) => message.profile))) },
          },
          select: { botProfileName: true, retailer: true },
        })
      : [];
    const retailerByProfile = new Map(accounts.map((account) => [account.botProfileName, account.retailer]));

    summarySuccesses = (query.data.status && query.data.status !== "success" ? [] : matchedMessages)
      .map((message) => {
        const retailer = retailerByProfile.get(message.profile) ?? message.retailer ?? "";
        return {
          id: message.messageId,
          userId: authContext.userId,
          retailer,
          item: message.item,
          qtyLabel: message.quantity,
          price: message.price?.toFixed(2) ?? "0.00",
          status: "success" as const,
          trackingNumber: null,
          orderNumber: null,
          ticketCode: message.messageId,
          occurredAt: message.occurredAt.toISOString(),
          imageUrl: message.imageUrl,
        };
      })
      .filter((checkout) => !query.data.q
        || checkout.item.toLowerCase().includes(query.data.q.toLowerCase())
        || checkout.retailer.toLowerCase().includes(query.data.q.toLowerCase()));
  }

  return NextResponse.json({
    data: checkouts.map((checkout) => ({
      ...checkout,
      price: checkout.price.toString(),
      imageUrl: imageByCheckoutId.get(checkout.id) ?? null,
    })),
    summarySuccesses,
  });
}