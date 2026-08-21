import { prisma } from "@chudaco/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/api-auth";

const checkoutQuerySchema = z.object({
  status: z.enum(["success", "failed", "pending"]).optional(),
  q: z.string().trim().min(1).optional(),
});

export async function GET(request: NextRequest) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = checkoutQuerySchema.safeParse({
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    q: request.nextUrl.searchParams.get("q") ?? undefined,
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

  const checkouts = await prisma.checkout.findMany({
    where: {
      userId: authContext.userId,
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

  return NextResponse.json({
    data: checkouts.map((checkout) => ({
      ...checkout,
      price: checkout.price.toString(),
    })),
  });
}