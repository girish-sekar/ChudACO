import { FeeType, prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDiscordIds, getAuthenticatedContext } from "@/lib/api-auth";

const patchPricingRuleSchema = z
  .object({
    category: z.string().trim().min(1).optional(),
    priceRangeLabel: z.string().trim().min(1).optional(),
    feeType: z.nativeEnum(FeeType).optional(),
    feeFlat: z.union([z.string(), z.number(), z.null()]).optional(),
    feePercent: z.union([z.string(), z.number(), z.null()]).optional(),
    minPrice: z.union([z.string(), z.number(), z.null()]).optional(),
    maxPrice: z.union([z.string(), z.number(), z.null()]).optional(),
    sortOrder: z.coerce.number().int().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

function normalizeDecimal(value: string | number | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const asString = String(value).trim();
  if (!asString) {
    return null;
  }

  const parsed = Number(asString);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid decimal value: ${asString}`);
  }

  return parsed.toFixed(2);
}

function serializeRule(rule: {
  id: string;
  category: string;
  priceRangeLabel: string;
  feeType: FeeType;
  feeFlat: { toString(): string } | null;
  feePercent: { toString(): string } | null;
  minPrice: { toString(): string } | null;
  maxPrice: { toString(): string } | null;
  sortOrder: number;
}) {
  return {
    ...rule,
    feeFlat: rule.feeFlat?.toString() ?? null,
    feePercent: rule.feePercent?.toString() ?? null,
    minPrice: rule.minPrice?.toString() ?? null,
    maxPrice: rule.maxPrice?.toString() ?? null,
  };
}

async function requireAdmin() {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const admins = getAdminDiscordIds();
  if (!admins.has(authContext.discordId)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { authContext };
}

type RouteParams = {
  params: {
    id: string;
  };
};

export async function PATCH(request: Request, context: RouteParams) {
  const guard = await requireAdmin();
  if ("error" in guard) {
    return guard.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = patchPricingRuleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await prisma.pricingRule.findUnique({
    where: { id: context.params.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Pricing rule not found" }, { status: 404 });
  }

  const nextFeeType = parsed.data.feeType ?? existing.feeType;
  const nextFeeFlat =
    parsed.data.feeFlat !== undefined
      ? parsed.data.feeFlat
      : existing.feeFlat?.toString() ?? null;
  const nextFeePercent =
    parsed.data.feePercent !== undefined
      ? parsed.data.feePercent
      : existing.feePercent?.toString() ?? null;

  const hasFeeFlat = nextFeeFlat !== null && nextFeeFlat !== undefined && String(nextFeeFlat).trim() !== "";
  const hasFeePercent =
    nextFeePercent !== null && nextFeePercent !== undefined && String(nextFeePercent).trim() !== "";

  if (nextFeeType === FeeType.flat && !hasFeeFlat) {
    return NextResponse.json(
      { error: "feeFlat is required when feeType is flat" },
      { status: 400 },
    );
  }

  if (nextFeeType === FeeType.percent && !hasFeePercent) {
    return NextResponse.json(
      { error: "feePercent is required when feeType is percent" },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.pricingRule.update({
      where: { id: context.params.id },
      data: {
        category: parsed.data.category,
        priceRangeLabel: parsed.data.priceRangeLabel,
        feeType: nextFeeType,
        feeFlat: nextFeeType === FeeType.flat ? normalizeDecimal(nextFeeFlat) : null,
        feePercent: nextFeeType === FeeType.percent ? normalizeDecimal(nextFeePercent) : null,
        minPrice:
          parsed.data.minPrice !== undefined
            ? normalizeDecimal(parsed.data.minPrice)
            : undefined,
        maxPrice:
          parsed.data.maxPrice !== undefined
            ? normalizeDecimal(parsed.data.maxPrice)
            : undefined,
        sortOrder: parsed.data.sortOrder,
      },
    });

    return NextResponse.json({ data: serializeRule(updated) });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to update pricing rule",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteParams) {
  const guard = await requireAdmin();
  if ("error" in guard) {
    return guard.error;
  }

  const existing = await prisma.pricingRule.findUnique({
    where: { id: context.params.id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Pricing rule not found" }, { status: 404 });
  }

  await prisma.pricingRule.delete({
    where: { id: context.params.id },
  });

  return NextResponse.json({ success: true });
}
