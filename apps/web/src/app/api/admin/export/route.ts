import { prisma } from "@chudaco/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDiscordIds, getAuthenticatedContext } from "@/lib/api-auth";

const querySchema = z.object({
  format: z.enum(["csv", "json"]).default("json"),
});

type ExportRow = {
  userId: string;
  discordId: string;
  username: string;
  avatarUrl: string | null;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  notifyWeeklySummary: boolean;
  userCreatedAt: Date;
  acoAccountId: string;
  acoLabel: string;
  acoRetailer: string;
  acoEmail: string;
  acoLoginEmail: string | null;
  acoStatus: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: string;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddr: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingZip: string | null;
  lastSyncAt: Date | null;
  cardBrand: string | null;
  cardLast4: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
  cardholderName: string | null;
};

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes("\"")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(rows: ExportRow[]): string {
  const headers = [
    "userId",
    "discordId",
    "username",
    "avatarUrl",
    "notifyOnSuccess",
    "notifyOnFailure",
    "notifyWeeklySummary",
    "userCreatedAt",
    "acoAccountId",
    "acoLabel",
    "acoRetailer",
    "acoEmail",
    "acoLoginEmail",
    "acoStatus",
    "imapHost",
    "imapPort",
    "imapSecurity",
    "shippingName",
    "shippingPhone",
    "shippingAddr",
    "shippingCity",
    "shippingState",
    "shippingZip",
    "lastSyncAt",
    "cardBrand",
    "cardLast4",
    "cardExpMonth",
    "cardExpYear",
    "cardholderName",
  ];

  const lines = rows.map((row) => {
    const values = [
      row.userId,
      row.discordId,
      row.username,
      row.avatarUrl ?? "",
      String(row.notifyOnSuccess),
      String(row.notifyOnFailure),
      String(row.notifyWeeklySummary),
      row.userCreatedAt.toISOString(),
      row.acoAccountId,
      row.acoLabel,
      row.acoRetailer,
      row.acoEmail,
      row.acoLoginEmail ?? "",
      row.acoStatus,
      row.imapHost,
      String(row.imapPort),
      row.imapSecurity,
      row.shippingName ?? "",
      row.shippingPhone ?? "",
      row.shippingAddr ?? "",
      row.shippingCity ?? "",
      row.shippingState ?? "",
      row.shippingZip ?? "",
      row.lastSyncAt?.toISOString() ?? "",
      row.cardBrand ?? "",
      row.cardLast4 ?? "",
      row.cardExpMonth ? String(row.cardExpMonth) : "",
      row.cardExpYear ? String(row.cardExpYear) : "",
      row.cardholderName ?? "",
    ];

    return values.map((value) => escapeCsv(value)).join(",");
  });

  return `${headers.join(",")}\n${lines.join("\n")}`;
}

export async function GET(request: NextRequest) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admins = getAdminDiscordIds();
  if (!admins.has(authContext.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = querySchema.safeParse({
    format: request.nextUrl.searchParams.get("format") ?? "json",
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const users = await prisma.user.findMany({
    orderBy: { username: "asc" },
    include: {
      acoAccounts: {
        orderBy: { label: "asc" },
        include: {
          cardOnFile: true,
        },
      },
    },
  });

  const rows: ExportRow[] = users.flatMap((user) => {
    if (user.acoAccounts.length === 0) {
      return [];
    }

    return user.acoAccounts.map((account) => ({
      userId: user.id,
      discordId: user.discordId,
      username: user.username,
      avatarUrl: user.avatarUrl,
      notifyOnSuccess: user.notifyOnSuccess,
      notifyOnFailure: user.notifyOnFailure,
      notifyWeeklySummary: user.notifyWeeklySummary,
      userCreatedAt: user.createdAt,
      acoAccountId: account.id,
      acoLabel: account.label,
      acoRetailer: account.retailer,
      acoEmail: account.email,
      acoLoginEmail: account.loginEmail,
      acoStatus: account.status,
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      imapSecurity: account.imapSecurity,
      shippingName: account.shippingName,
      shippingPhone: account.shippingPhone,
      shippingAddr: account.shippingAddr,
      shippingCity: account.shippingCity,
      shippingState: account.shippingState,
      shippingZip: account.shippingZip,
      lastSyncAt: account.lastSyncAt,
      cardBrand: account.cardOnFile?.cardBrand ?? null,
      cardLast4: account.cardOnFile?.last4 ?? null,
      cardExpMonth: account.cardOnFile?.expMonth ?? null,
      cardExpYear: account.cardOnFile?.expYear ?? null,
      cardholderName: account.cardOnFile?.cardholderName ?? null,
    }));
  });

  if (parsed.data.format === "csv") {
    const csv = toCsv(rows);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=chudaco-export.csv",
      },
    });
  }

  return NextResponse.json({ data: rows });
}