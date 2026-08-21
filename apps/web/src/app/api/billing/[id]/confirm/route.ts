import { BillingStatus, prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDiscordIds, getAuthenticatedContext } from "@/lib/api-auth";

const paramsSchema = z.object({
  id: z.string().cuid(),
});

export async function POST(_: Request, context: { params: { id: string } }) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admins = getAdminDiscordIds();
  if (!admins.has(authContext.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsedParams = paramsSchema.safeParse(context.params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Invalid billing entry id", details: parsedParams.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await prisma.billingEntry.findUnique({
    where: { id: parsedParams.data.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Billing entry not found" }, { status: 404 });
  }

  const updated = await prisma.billingEntry.update({
    where: { id: existing.id },
    data: {
      status: BillingStatus.paid,
      confirmedAt: new Date(),
    },
    include: {
      checkout: true,
    },
  });

  return NextResponse.json({
    data: {
      ...updated,
      feeAmount: updated.feeAmount.toString(),
      checkout: updated.checkout
        ? {
            ...updated.checkout,
            price: updated.checkout.price.toString(),
          }
        : null,
    },
  });
}