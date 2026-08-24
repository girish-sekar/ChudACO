import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/api-auth";

type RouteParams = {
  params: {
    id: string;
  };
};

export async function POST(_request: Request, context: RouteParams) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.acoAccount.findFirst({
    where: { id: context.params.id, userId: authContext.userId },
    select: {
      id: true,
      accountNumber: true,
      user: {
        select: {
          username: true,
        },
      },
    },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const nextBotProfileName = `${account.user.username} - ACO #${account.accountNumber}`;

  const updated = await prisma.acoAccount.update({
    where: { id: account.id },
    data: {
      botProfileName: nextBotProfileName,
    },
    select: {
      id: true,
      accountNumber: true,
      botProfileName: true,
    },
  });

  return NextResponse.json({ data: updated });
}
