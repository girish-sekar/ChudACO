import { prisma } from "@chudaco/db";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const context = await getAuthenticatedContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (cursor && !/^[a-z0-9]{1,100}$/i.test(cursor)) {
    return NextResponse.json({ error: "Invalid history cursor." }, { status: 400 });
  }
  const select = { id: true, acoAccountId: true, accountNumber: true, retailer: true, exportType: true, createdAt: true } as const;
  const [history, latest, user] = await Promise.all([
    prisma.accountPull.findMany({
      where: { userId: context.userId }, select,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.accountPull.findMany({
      where: { userId: context.userId }, select,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], distinct: ["accountKey", "retailer"],
    }),
    prisma.user.findUnique({ where: { id: context.userId }, select: { notifyOnAccountPull: true } }),
  ]);
  return NextResponse.json({
    data: history.slice(0, 20), latest,
    nextCursor: history.length > 20 ? history[19].id : null,
    notifyOnAccountPull: user?.notifyOnAccountPull ?? true,
  }, { headers: { "Cache-Control": "no-store" } });
}