import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/api-auth";

export async function GET() {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pricingRules = await prisma.pricingRule.findMany({
    orderBy: [{ sortOrder: "asc" }, { category: "asc" }],
  });

  return NextResponse.json({
    data: pricingRules.map((rule) => ({
      ...rule,
      feeFlat: rule.feeFlat?.toString() ?? null,
      feePercent: rule.feePercent?.toString() ?? null,
    })),
  });
}