import { FeeType, prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const internalCheckoutSchema = z.object({
  discordId: z.string().trim().min(1),
  retailer: z.string().trim().min(1),
  item: z.string().trim().min(1),
  qtyLabel: z.string().trim().min(1),
  price: z.coerce.number().positive(),
  status: z.enum(["success", "failed", "pending"]),
  trackingNumber: z.string().trim().min(1).optional(),
});

function isRangeMatch(label: string, price: number): boolean {
  const normalized = label.trim().toLowerCase();

  if (normalized.includes("under") && normalized.includes("$15")) {
    return price < 15;
  }

  if (normalized.includes("$15") && normalized.includes("$60")) {
    return price >= 15 && price <= 60;
  }

  if (normalized.includes("$40") && normalized.includes("$70")) {
    return price >= 40 && price <= 70;
  }

  if (normalized.includes("$100+")) {
    return price >= 100;
  }

  if (normalized === "any") {
    return true;
  }

  return false;
}

async function computeFee(price: number): Promise<string> {
  const rules = await prisma.pricingRule.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const matched = rules.find((rule) => isRangeMatch(rule.priceRangeLabel, price));
  if (!matched) {
    return "0.00";
  }

  if (matched.feeType === FeeType.percent) {
    const percentage = Number(matched.feePercent ?? 0);
    return (price * (percentage / 100)).toFixed(2);
  }

  return Number(matched.feeFlat ?? 0).toFixed(2);
}

async function generateTicketCode(): Promise<string> {
  for (let i = 0; i < 20; i += 1) {
    const digits = Math.floor(10000 + Math.random() * 90000);
    const ticketCode = `TKT-${digits}`;

    const exists = await prisma.checkout.findUnique({
      where: { ticketCode },
      select: { id: true },
    });

    if (!exists) {
      return ticketCode;
    }
  }

  throw new Error("Failed to generate unique ticket code");
}

export async function POST(request: Request) {
  const internalApiKey = process.env.INTERNAL_API_KEY;
  const providedKey = request.headers.get("x-internal-api-key")?.trim();

  if (!internalApiKey || !providedKey || providedKey !== internalApiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = internalCheckoutSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const user = await prisma.user.upsert({
    where: { discordId: data.discordId },
    update: {},
    create: {
      discordId: data.discordId,
      username: `discord-${data.discordId}`,
      avatarUrl: null,
    },
  });

  const ticketCode = await generateTicketCode();

  const createdCheckout = await prisma.checkout.create({
    data: {
      userId: user.id,
      retailer: data.retailer,
      item: data.item,
      qtyLabel: data.qtyLabel,
      price: data.price.toFixed(2),
      status: data.status,
      trackingNumber: data.trackingNumber ?? null,
      ticketCode,
    },
  });

  if (data.status === "success") {
    const feeAmount = await computeFee(data.price);

    await prisma.billingEntry.create({
      data: {
        userId: user.id,
        checkoutId: createdCheckout.id,
        feeAmount,
      },
    });
  }

  return NextResponse.json({
    data: {
      ...createdCheckout,
      price: createdCheckout.price.toString(),
    },
  });
}