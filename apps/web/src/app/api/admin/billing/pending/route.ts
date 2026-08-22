import { BillingStatus, prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { getAdminDiscordIds, getAuthenticatedContext } from "@/lib/api-auth";

export async function GET() {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admins = getAdminDiscordIds();
  if (!admins.has(authContext.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.billingEntry.findMany({
    where: {
      paidMarkedAt: { not: null },
      status: { not: BillingStatus.paid },
    },
    orderBy: { paidMarkedAt: "asc" },
    include: {
      user: { select: { id: true, username: true, discordId: true } },
      checkout: { select: { id: true, item: true, retailer: true } },
    },
  });

  return NextResponse.json({
    data: rows.map((entry) => ({
      ...entry,
      feeAmount: entry.feeAmount.toString(),
      user: entry.user,
      checkout: entry.checkout,
    })),
  });
}