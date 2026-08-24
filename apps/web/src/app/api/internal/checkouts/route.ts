import { FeeType, prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const workerCheckoutSchema = z.object({
  profile: z.string().trim().min(1),
  site: z.string().trim().min(1),
  mode: z.string().trim().min(1),
  item: z.string().trim().min(1),
  quantity: z.coerce.number().int().positive(),
  price: z.string().trim().min(1),
  size: z.string().trim().optional(),
  color: z.string().trim().optional(),
  image: z.string().trim().optional(),
});

function parsePriceToNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
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

function computeFeeAmountForRule(
  feeType: FeeType,
  feeFlat: string | number | null,
  feePercent: string | number | null,
  price: number,
): string | null {
  if (feeType === FeeType.flat) {
    if (feeFlat === null || feeFlat === undefined) {
      return null;
    }

    return Number(feeFlat).toFixed(2);
  }

  if (feePercent === null || feePercent === undefined) {
    return null;
  }

  return (price * (Number(feePercent) / 100)).toFixed(2);
}

export async function POST(request: Request) {
  const internalApiKey = process.env.INTERNAL_API_KEY?.trim();
  const workerIngestSecret = process.env.WORKER_INGEST_SECRET?.trim();
  const providedInternalApiKey = request.headers.get("x-internal-api-key")?.trim();
  const providedWorkerIngestSecret = request.headers.get("x-worker-ingest-secret")?.trim();

  const internalAuthorized =
    Boolean(internalApiKey) &&
    Boolean(providedInternalApiKey) &&
    providedInternalApiKey === internalApiKey;
  const workerAuthorized =
    Boolean(workerIngestSecret) &&
    Boolean(providedWorkerIngestSecret) &&
    providedWorkerIngestSecret === workerIngestSecret;

  if (!internalAuthorized && !workerAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = workerCheckoutSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const parsedPrice = parsePriceToNumber(data.price);
  if (parsedPrice === null) {
    return NextResponse.json({ error: "Invalid price format" }, { status: 400 });
  }

  const normalizedPrice = parsedPrice.toFixed(2);

  const account = await prisma.acoAccount.findUnique({
    where: { botProfileName: data.profile },
    select: {
      id: true,
      userId: true,
      retailer: true,
    },
  });

  if (!account) {
    console.error("Worker checkout profile did not match any ACO account", {
      profile: data.profile,
      site: data.site,
      mode: data.mode,
    });
    return NextResponse.json(
      { error: "No ACO account found for profile name", profile: data.profile },
      { status: 422 },
    );
  }

  const dedupeWindowStart = new Date(Date.now() - 5 * 60 * 1000);
  const existing = await prisma.checkout.findFirst({
    where: {
      acoAccountId: account.id,
      item: data.item,
      price: normalizedPrice,
      occurredAt: { gte: dedupeWindowStart },
    },
    orderBy: { occurredAt: "desc" },
  });

  // This dedupe heuristic can suppress a true repeat purchase within 5 minutes,
  // but that is safer than double-billing on webhook retries.
  if (existing) {
    return NextResponse.json({
      data: {
        ...existing,
        price: existing.price.toString(),
      },
      deduplicated: true,
    });
  }

  const pricingRules = await prisma.pricingRule.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const matchedRule = pricingRules.find((rule) => {
    const min = rule.minPrice !== null ? Number(rule.minPrice) : 0;
    const max = rule.maxPrice !== null ? Number(rule.maxPrice) : null;

    // Seed ranges currently overlap (40-60). We intentionally use first sortOrder match.
    return parsedPrice >= min && (max === null || parsedPrice <= max);
  });

  const feeAmount = matchedRule
    ? computeFeeAmountForRule(
        matchedRule.feeType,
        matchedRule.feeFlat?.toString() ?? null,
        matchedRule.feePercent?.toString() ?? null,
        parsedPrice,
      )
    : null;

  const ticketCode = await generateTicketCode();

  const created = await prisma.$transaction(async (tx) => {
    const checkout = await tx.checkout.create({
      data: {
        userId: account.userId,
        acoAccountId: account.id,
        retailer: account.retailer,
        item: data.item,
        qtyLabel: `Qty ${data.quantity}`,
        price: normalizedPrice,
        status: "success",
        ticketCode,
      },
    });

    if (matchedRule && feeAmount) {
      await tx.billingEntry.create({
        data: {
          userId: account.userId,
          checkoutId: checkout.id,
          feeAmount,
        },
      });
    } else {
      console.error("Checkout created without billing rule match", {
        checkoutId: checkout.id,
        acoAccountId: account.id,
        item: data.item,
        price: normalizedPrice,
      });
    }

    return checkout;
  });

  return NextResponse.json({
    data: {
      ...created,
      price: created.price.toString(),
    },
  });
}
