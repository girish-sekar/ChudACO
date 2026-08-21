import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/api-auth";

export async function GET() {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const paymentMethods = await prisma.paymentMethod.findMany({
    orderBy: { label: "asc" },
  });

  return NextResponse.json({ data: paymentMethods });
}