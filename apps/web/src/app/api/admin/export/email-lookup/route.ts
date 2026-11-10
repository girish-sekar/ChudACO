import { prisma } from "@chudaco/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDiscordIds, getAuthenticatedContext } from "@/lib/api-auth";

const bodySchema = z.object({
  retailer: z.string().trim().min(1),
  emails: z.array(z.string().trim().min(3)).min(1).max(5000),
});

export async function POST(request: NextRequest) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!getAdminDiscordIds().has(authContext.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const retailer = parsed.data.retailer;
  const emails = Array.from(
    new Set(parsed.data.emails.map((value) => value.trim().toLowerCase()).filter(Boolean)),
  );

  if (emails.length === 0) {
    return NextResponse.json({ error: "Provide at least one email address." }, { status: 400 });
  }

  const retailerMatch = { equals: retailer, mode: "insensitive" as const };

  const accounts = await prisma.acoAccount.findMany({
    where: {
      OR: [{ retailer: retailerMatch }, { retailerLogins: { some: { retailer: retailerMatch } } }],
      AND: [
        {
          OR: [
            { loginEmail: { in: emails, mode: "insensitive" } },
            { email: { in: emails, mode: "insensitive" } },
            { retailerLogins: { some: { retailer: retailerMatch, loginEmail: { in: emails, mode: "insensitive" } } } },
          ],
        },
      ],
    },
    orderBy: [{ retailer: "asc" }, { label: "asc" }],
    select: {
      id: true,
      retailer: true,
      label: true,
      botProfileName: true,
      loginEmail: true,
      email: true,
      retailerLogins: {
        select: { retailer: true, loginEmail: true, enabled: true },
      },
    },
  });

  const matched = accounts.map((account) => {
    const retailerLogin = account.retailerLogins.find(
      (login) =>
        login.retailer.toLowerCase() === retailer.toLowerCase() &&
        emails.includes(login.loginEmail.trim().toLowerCase()),
    );
    const fallbackLogin = account.retailerLogins.find(
      (login) => login.retailer.toLowerCase() === retailer.toLowerCase(),
    );
    const matchedEmail =
      retailerLogin?.loginEmail ??
      (account.loginEmail && emails.includes(account.loginEmail.trim().toLowerCase())
        ? account.loginEmail
        : null) ??
      (account.email && emails.includes(account.email.trim().toLowerCase()) ? account.email : null) ??
      fallbackLogin?.loginEmail ??
      null;

    return {
      accountId: account.id,
      label: account.label,
      botProfileName: account.botProfileName,
      retailer: account.retailer,
      loginEmail: matchedEmail,
    };
  });

  const matchedEmailSet = new Set(
    matched
      .map((entry) => entry.loginEmail?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value)),
  );
  const unmatched = emails.filter((value) => !matchedEmailSet.has(value));

  return NextResponse.json({
    retailer,
    matched,
    accountIds: matched.map((entry) => entry.accountId),
    unmatched,
  });
}
