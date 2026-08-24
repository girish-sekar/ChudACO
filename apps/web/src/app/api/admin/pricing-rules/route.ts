import { FeeType, prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDiscordIds, getAuthenticatedContext } from "@/lib/api-auth";

const pricingRuleSchema = z
  .object({
    category: z.string().trim().min(1),
    priceRangeLabel: z.string().trim().min(1),
    feeType: z.nativeEnum(FeeType),
    feeFlat: z.union([z.string(), z.number(), z.null()]).optional(),
    feePercent: z.union([z.string(), z.number(), z.null()]).optional(),
    minPrice: z.union([z.string(), z.number(), z.null()]).optional(),
    maxPrice: z.union([z.string(), z.number(), z.null()]).optional(),
    sortOrder: z.coerce.number().int(),
  })
  .superRefine((value, ctx) => {
    const hasFeeFlat = value.feeFlat !== undefined && value.feeFlat !== null && String(value.feeFlat).trim() !== "";
    const hasFeePercent =
      value.feePercent !== undefined && value.feePercent !== null && String(value.feePercent).trim() !== "";

    if (value.feeType === FeeType.flat && !hasFeeFlat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["feeFlat"],
        message: "feeFlat is required when feeType is flat",
      });
    }

    if (value.feeType === FeeType.percent && !hasFeePercent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["feePercent"],
        message: "feePercent is required when feeType is percent",
      });
    }
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

export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) {
    return guard.error;
  }

  const rules = await prisma.pricingRule.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  return NextResponse.json({ data: rules.map((rule) => serializeRule(rule)) });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) {
    return guard.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = pricingRuleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const created = await prisma.pricingRule.create({
      data: {
        category: parsed.data.category,
        priceRangeLabel: parsed.data.priceRangeLabel,
        feeType: parsed.data.feeType,
        feeFlat:
          parsed.data.feeType === FeeType.flat ? normalizeDecimal(parsed.data.feeFlat ?? null) : null,
        feePercent:
          parsed.data.feeType === FeeType.percent
            ? normalizeDecimal(parsed.data.feePercent ?? null)
            : null,
        minPrice: normalizeDecimal(parsed.data.minPrice ?? null),
        maxPrice: normalizeDecimal(parsed.data.maxPrice ?? null),
        sortOrder: parsed.data.sortOrder,
      },
    });

    return NextResponse.json({ data: serializeRule(created) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to create pricing rule",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 400 },
    );
  }
}
