import { prisma } from "@chudaco/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDiscordIds, getAuthenticatedContext } from "@/lib/api-auth";

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  retailer: z.string().trim().min(1).optional(),
  status: z.enum(["success", "failed", "pending"]).optional(),
  userId: z.string().cuid().optional(),
});

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
    retailer: request.nextUrl.searchParams.get("retailer") ?? undefined,
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    userId: request.nextUrl.searchParams.get("userId") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const where = {
    ...(parsed.data.from || parsed.data.to
      ? {
          occurredAt: {
            ...(parsed.data.from ? { gte: new Date(parsed.data.from) } : {}),
            ...(parsed.data.to ? { lte: new Date(parsed.data.to) } : {}),
          },
        }
      : {}),
    ...(parsed.data.retailer
      ? {
          retailer: { contains: parsed.data.retailer, mode: "insensitive" as const },
        }
      : {}),
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.userId ? { userId: parsed.data.userId } : {}),
  };

  const [rows, statusGroups, volumeAgg] = await Promise.all([
    prisma.checkout.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      include: {
        user: { select: { id: true, username: true, discordId: true } },
        acoAccount: { select: { id: true, label: true } },
      },
    }),
    prisma.checkout.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.checkout.aggregate({ where, _sum: { price: true }, _count: { _all: true } }),
  ]);

  const counts = {
    success: 0,
    failed: 0,
    pending: 0,
  };

  for (const group of statusGroups) {
    counts[group.status] = group._count._all;
  }

  return NextResponse.json({
    data: rows.map((checkout) => ({
      ...checkout,
      price: checkout.price.toString(),
      user: checkout.user,
      acoAccount: checkout.acoAccount,
    })),
    summary: {
      totalCheckouts: volumeAgg._count._all,
      successCount: counts.success,
      failedCount: counts.failed,
      pendingCount: counts.pending,
      totalDollarVolume: volumeAgg._sum.price?.toString() ?? "0",
    },
  });
}