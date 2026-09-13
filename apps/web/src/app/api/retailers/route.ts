import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/api-auth";
import { DEFAULT_RETAILERS } from "@/lib/dashboard";

export async function GET() {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const retailers = await prisma.retailer.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    if (retailers.length > 0) {
      return NextResponse.json({ data: retailers });
    }
  } catch (error) {
    console.error("Failed to query retailers from database:", error);
  }

  const fallbackData = DEFAULT_RETAILERS.map((name, index) => ({
    id: `default-${index + 1}`,
    name,
    isActive: true,
    sortOrder: index + 1,
  }));

  return NextResponse.json({ data: fallbackData });
}
