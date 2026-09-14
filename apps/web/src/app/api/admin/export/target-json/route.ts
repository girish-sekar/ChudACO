import { prisma } from "@chudaco/db";
import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDiscordIds, getAuthenticatedContext } from "@/lib/api-auth";
import { getGoogleSheetsConfig } from "@/lib/payment-info";

const querySchema = z.object({
  retailer: z.string().trim().min(1).optional(),
  retailers: z.string().trim().min(1).optional(),
});

const HAYHA_RETAILERS = ["Target", "Bandai"];

function isHayhaRetailer(retailer: string): boolean {
  const norm = retailer.trim().toLowerCase();
  return norm === "target" || norm === "bandai";
}

function parseRetailerFilters(single?: string, multiple?: string): string[] {
  const fromSingle = single ? [single.trim()] : [];
  const fromMultiple = multiple
    ? multiple
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : [];

  return [...new Set([...fromSingle, ...fromMultiple])];
}

function splitName(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length <= 1) {
    return { firstName: trimmed, lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function splitAddress(value: string | null | undefined) {
  const normalized = (value ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { address: "", address2: "" };
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    address: lines[0] ?? "",
    address2: lines.slice(1).join(" "),
  };
}

function formatPhone(value: string | null | undefined) {
  return (value ?? "").trim();
}

function formatExpYear(value: string | number | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";

  const year = normalized.replace(/[^0-9]/g, "");
  if (!year) return "";

  if (year.length === 2) {
    return `20${year}`;
  }

  return year.length >= 4 ? year.slice(0, 4) : year;
}

function formatExpMonth(value: string | number | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";

  const month = normalized.replace(/[^0-9]/g, "");
  if (!month) return "";

  const numeric = Number(month);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 12) {
    return month.padStart(2, "0");
  }

  return String(numeric).padStart(2, "0");
}

const stateAbbreviations: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
  "District of Columbia": "DC",
};

function formatState(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) return "";

  const directMatch = stateAbbreviations[normalized];
  if (directMatch) return directMatch;

  const lowerCaseMatch = Object.entries(stateAbbreviations).find(
    ([name]) => name.toLowerCase() === normalized.toLowerCase(),
  );
  if (lowerCaseMatch) return lowerCaseMatch[1];

  return normalized.toUpperCase();
}

async function getGoogleSheetRows(): Promise<string[][]> {
  const { spreadsheetId, sheetName, keyPath } = getGoogleSheetsConfig();
  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: authClient as any });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:AD`,
  });

  return (response.data.values ?? []).map((row) => row.map((value) => String(value ?? "")));
}

function findMatchingSheetRow(sheetRows: string[][], account: { email: string; loginEmail: string | null; botProfileName: string }) {
  const emailCandidates = [
    (account.loginEmail ?? account.email ?? "").trim().toLowerCase(),
    (account.email ?? "").trim().toLowerCase(),
  ].filter(Boolean);
  const profileCandidate = (account.botProfileName ?? "").trim().toLowerCase();

  return sheetRows.find((row) => {
    const rowEmail = (row[0] ?? "").trim().toLowerCase();
    const rowProfile = (row[1] ?? "").trim().toLowerCase();

    const matchesEmail = emailCandidates.some((email) => email && rowEmail === email);
    const matchesProfile = Boolean(profileCandidate && rowProfile === profileCandidate);
    return matchesEmail || matchesProfile;
  });
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
    retailer: request.nextUrl.searchParams.get("retailer") ?? undefined,
    retailers: request.nextUrl.searchParams.get("retailers") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const userFilters = parseRetailerFilters(parsed.data.retailer, parsed.data.retailers);
  const effectiveRetailerFilters =
    userFilters.length > 0 ? userFilters.filter(isHayhaRetailer) : HAYHA_RETAILERS;

  if (userFilters.length > 0 && effectiveRetailerFilters.length === 0) {
    return new NextResponse("[]", {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": "attachment; filename=hayha-accounts.json",
      },
    });
  }

  const accounts = await prisma.acoAccount.findMany({
    where: {
      OR: [
        ...effectiveRetailerFilters.map((retailer) => ({
          retailer: { equals: retailer, mode: "insensitive" as const },
        })),
        ...effectiveRetailerFilters.map((retailer) => ({
          retailerLogins: {
            some: {
              retailer: { equals: retailer, mode: "insensitive" as const },
            },
          },
        })),
      ],
    },
    orderBy: [{ retailer: "asc" }, { label: "asc" }],
    include: {
      cardOnFile: true,
      retailerCards: true,
      retailerLogins: true,
    },
  });

  const sheetRows = await getGoogleSheetRows();

  const payload = accounts
    .filter((account) => {
      const logins = account.retailerLogins.length > 0
        ? account.retailerLogins
        : [{ retailer: account.retailer }];
      return logins.some((l) =>
        effectiveRetailerFilters.some((rf) => rf.toLowerCase() === l.retailer.toLowerCase())
      );
    })
    .map((account) => {
      const matchingRow = findMatchingSheetRow(sheetRows, account);
      const shippingName = splitName(account.shippingName ?? account.billingName ?? account.botProfileName ?? "");
      const address = splitAddress(account.shippingAddr);
      const selectedRetailer =
        effectiveRetailerFilters.find((retailer) =>
          [account.retailer, ...(account.retailerLogins ?? []).map((login) => login.retailer)].some(
            (value) => value.toLowerCase() === retailer.toLowerCase(),
          ),
        ) ?? effectiveRetailerFilters[0];
      const selectedCard =
        account.retailerCards.find((card) => card.retailer.toLowerCase() === selectedRetailer.toLowerCase()) ??
        account.cardOnFile;

      const sheetCardNumber = matchingRow?.[5] ?? "";
      const sheetCvv = matchingRow?.[8] ?? "";
      const sheetCardholderName = matchingRow?.[3] ?? selectedCard?.cardholderName ?? "";
      const sheetExpMonth = formatExpMonth(matchingRow?.[6] ?? (selectedCard?.expMonth != null ? String(selectedCard.expMonth) : ""));
      const sheetExpYear = formatExpYear(matchingRow?.[7] ?? (selectedCard?.expYear != null ? String(selectedCard.expYear) : ""));

      const sheetProfileName = matchingRow?.[1] ?? account.botProfileName;

      return {
        name: sheetProfileName,
        shipping: {
          firstName: shippingName.firstName,
          lastName: shippingName.lastName,
          email: account.email,
          phone: formatPhone(account.shippingPhone ?? account.billingPhone),
          address: address.address,
          address2: address.address2,
          country: "United States",
          state: formatState(account.shippingState ?? account.billingState),
          city: account.shippingCity ?? account.billingCity ?? "",
          zipCode: account.shippingZip ?? account.billingZip ?? "",
        },
        cardInfo: {
          cardNumber: sheetCardNumber,
          holder: sheetCardholderName || selectedCard?.cardholderName || "",
          expMonth: sheetExpMonth,
          expYear: sheetExpYear,
          cvv: sheetCvv,
        },
        sameAsBilling: account.billingSameAsShipping,
        groupId: crypto.randomUUID(),
        id: crypto.randomUUID(),
        encrypted: false,
      };
    });

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=hayha-accounts.json",
    },
  });
}

