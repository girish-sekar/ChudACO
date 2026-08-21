import { BillingStatus, prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/api-auth";

export async function GET() {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [entries, totalOwedAgg, paidThisMonthAgg, overdueCount] = await Promise.all([
    prisma.billingEntry.findMany({
      where: { userId: authContext.userId },
      include: { checkout: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.billingEntry.aggregate({
      where: {
        userId: authContext.userId,
        status: { in: [BillingStatus.due, BillingStatus.overdue] },
      },
      _sum: { feeAmount: true },
    }),
    prisma.billingEntry.aggregate({
      where: {
        userId: authContext.userId,
        status: BillingStatus.paid,
        confirmedAt: { gte: monthStart },
      },
      _sum: { feeAmount: true },
    }),
    prisma.billingEntry.count({
      where: {
        userId: authContext.userId,
        status: BillingStatus.overdue,
      },
    }),
  ]);

  return NextResponse.json({
    data: entries.map((entry) => ({
      ...entry,
      feeAmount: entry.feeAmount.toString(),
      checkout: entry.checkout
        ? {
            ...entry.checkout,
            price: entry.checkout.price.toString(),
          }
        : null,
    })),
    summary: {
      totalOwed: totalOwedAgg._sum.feeAmount?.toString() ?? "0",
      paidThisMonth: paidThisMonthAgg._sum.feeAmount?.toString() ?? "0",
      overdueCount,
    },
  });
}