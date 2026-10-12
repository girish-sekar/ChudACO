import { prisma } from "@chudaco/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/api-auth";
import { fetchDiscordSuccessMessages } from "@/lib/discord-success";

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

  const imageByCheckoutId = new Map<string, string>();
  if (checkouts.length > 0 && profileByAccountId.size > 0) {
    const rangeStart = query.data.from
      ? new Date(query.data.from)
      : new Date(Math.min(...checkouts.map((checkout) => checkout.occurredAt.getTime())));
    const rangeEnd = query.data.to
      ? new Date(query.data.to)
      : new Date(Math.max(...checkouts.map((checkout) => checkout.occurredAt.getTime())));
    const { messages } = await fetchDiscordSuccessMessages(rangeStart, rangeEnd);

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

  return NextResponse.json({
    data: checkouts.map((checkout) => ({
      ...checkout,
      price: checkout.price.toString(),
      imageUrl: imageByCheckoutId.get(checkout.id) ?? null,
    })),
  });
}