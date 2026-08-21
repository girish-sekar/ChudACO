import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/api-auth";

const paramsSchema = z.object({
  id: z.string().cuid(),
});

export async function POST(_: Request, context: { params: { id: string } }) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(context.params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Invalid billing entry id", details: parsedParams.error.flatten() },
      { status: 400 },
    );
  }

  const billingEntry = await prisma.billingEntry.findUnique({
    where: { id: parsedParams.data.id },
  });

  if (!billingEntry) {
    return NextResponse.json({ error: "Billing entry not found" }, { status: 404 });
  }

  if (billingEntry.userId !== authContext.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.billingEntry.update({
    where: { id: billingEntry.id },
    data: {
      paidMarkedAt: new Date(),
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