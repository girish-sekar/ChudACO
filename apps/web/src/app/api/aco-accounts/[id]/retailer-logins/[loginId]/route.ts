import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/api-auth";

const toggleSchema = z.object({
  enabled: z.boolean(),
});

type RouteParams = {
  params: {
    id: string;
    loginId: string;
  };
};

export async function PATCH(request: Request, context: RouteParams) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = toggleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const login = await prisma.acoRetailerLogin.findFirst({
    where: {
      id: context.params.loginId,
      acoAccountId: context.params.id,
      acoAccount: { userId: authContext.userId },
    },
    select: { id: true },
  });

  if (!login) {
    return NextResponse.json({ error: "Retailer login not found" }, { status: 404 });
  }

  const updated = await prisma.acoRetailerLogin.update({
    where: { id: login.id },
    data: { enabled: parsed.data.enabled },
    select: { id: true, retailer: true, loginEmail: true, enabled: true },
  });

  return NextResponse.json({ data: updated });
}
