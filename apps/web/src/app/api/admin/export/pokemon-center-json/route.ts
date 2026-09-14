import { prisma } from "@chudaco/db";
import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDiscordIds, getAuthenticatedContext } from "@/lib/api-auth";
import { getGoogleSheetsConfig } from "@/lib/payment-info";
import { findSheetCardRow } from "@/lib/sheet-card";

const querySchema = z.object({
  retailer: z.string().trim().min(1).optional(),
  retailers: z.string().trim().min(1).optional(),
});

const STELLAR_RETAILERS = [
  "Pokemon Center",
  "Pokémon Center",
  "PKC",
  "PokemonCenter",
  "Sam's Club",
  "Sams Club",
  "Costco",
];

function isStellarRetailer(retailer: string): boolean {
  const norm = retailer.trim().toLowerCase();
  return (
    norm === "pokemon center" ||
    norm === "pokémon center" ||
    norm === "pkc" ||
    norm === "pokemoncenter" ||
    norm === "sam's club" ||
    norm === "sams club" ||
    norm === "sam club" ||
    norm === "costco"
  );
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

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
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

  return year.length >= 4 ? year.slice(-2) : year;
}

function formatExpMonth(value: string | number | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";

  const month = normalized.replace(/[^0-9]/g, "");
  if (!month) return "";

  const numeric = Number(month);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 12) return month.padStart(2, "0");

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

  const lowerCaseMatch = Object.entries(stateAbbreviations).find(([name]) => name.toLowerCase() === normalized.toLowerCase());
  if (lowerCaseMatch) return lowerCaseMatch[1];

  return normalized.toUpperCase();
}

function buildAddressBlock(value: string | null | undefined, city: string | null | undefined, state: string | null | undefined, zip: string | null | undefined) {
  const { address, address2 } = splitAddress(value);

  return {
    firstName: "",
    lastName: "",
    country: "US",
    address,
    address2,
    state: state ?? "",
    city: city ?? "",
    zipcode: zip ?? "",
  };
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
    userFilters.length > 0 ? userFilters.filter(isStellarRetailer) : STELLAR_RETAILERS;

  if (userFilters.length > 0 && effectiveRetailerFilters.length === 0) {
    return new NextResponse("[]", {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": "attachment; filename=stellar-accounts.json",
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
      const shippingName = splitName(account.shippingName ?? account.billingName ?? account.botProfileName ?? "");
      const billingName = splitName(account.billingSameAsShipping ? account.shippingName ?? account.billingName : account.billingName ?? account.shippingName ?? "");
      const shippingAddress = buildAddressBlock(account.shippingAddr, account.shippingCity, account.shippingState, account.shippingZip);
      const billingAddress = buildAddressBlock(
        account.billingSameAsShipping ? account.shippingAddr ?? account.billingAddr : account.billingAddr,
        account.billingSameAsShipping ? account.shippingCity ?? account.billingCity : account.billingCity,
        account.billingSameAsShipping ? account.shippingState ?? account.billingState : account.billingState,
        account.billingSameAsShipping ? account.shippingZip ?? account.billingZip : account.billingZip,
      );
      const selectedRetailer =
        effectiveRetailerFilters.find((retailer) =>
          [account.retailer, ...(account.retailerLogins ?? []).map((login) => login.retailer)].some(
            (value) => value.toLowerCase() === retailer.toLowerCase(),
          ),
        ) ?? effectiveRetailerFilters[0];
      const retailerCard = account.retailerCards.find(
        (card) => card.retailer.trim().toLowerCase() === selectedRetailer.trim().toLowerCase(),
      );
      const selectedCard = retailerCard ?? account.cardOnFile;
      const matchingRow = findSheetCardRow(sheetRows, account, selectedCard, retailerCard ? selectedRetailer : null);

      const sheetCardNumber = matchingRow?.[5] ?? "";
      const sheetCvv = matchingRow?.[8] ?? "";
      const sheetCardType = matchingRow?.[4] ?? selectedCard?.cardBrand ?? "";
      const sheetCardholderName = matchingRow?.[3] ?? selectedCard?.cardholderName ?? "";
      const sheetExpMonth = formatExpMonth(matchingRow?.[6] ?? (selectedCard?.expMonth != null ? String(selectedCard.expMonth) : ""));
      const sheetExpYear = formatExpYear(matchingRow?.[7] ?? (selectedCard?.expYear != null ? String(selectedCard.expYear) : ""));

      return {
        profileName: account.botProfileName,
        email: account.email,
        phone: formatPhone(account.shippingPhone ?? account.billingPhone),
        shipping: {
          ...shippingName,
          country: "US",
          address: shippingAddress.address,
          address2: shippingAddress.address2,
          state: formatState(shippingAddress.state),
          city: shippingAddress.city,
          zipcode: shippingAddress.zipcode,
        },
        billingAsShipping: account.billingSameAsShipping,
        oneCheckoutPerProfile: account.onlyOneCheckout,
        billing: {
          ...billingName,
          country: "US",
          address: billingAddress.address,
          address2: billingAddress.address2,
          state: formatState(billingAddress.state),
          city: billingAddress.city,
          zipcode: billingAddress.zipcode,
        },
        payment: {
          cardName: sheetCardholderName || selectedCard?.cardholderName || (account.billingSameAsShipping ? `${shippingName.firstName} ${shippingName.lastName}`.trim() : `${billingName.firstName} ${billingName.lastName}`.trim()),
          cardType: sheetCardType || selectedCard?.cardBrand || "",
          cardNumber: sheetCardNumber,
          cardMonth: sheetExpMonth,
          cardYear: sheetExpYear,
          cardCvv: sheetCvv,
        },
      };
    });

  const missingCards = payload.filter((profile) => !profile.payment.cardNumber || !profile.payment.cardCvv);
  if (missingCards.length > 0) {
    return NextResponse.json({
      error: "Matching card details are missing. Re-save the assigned card before exporting.",
      detail: missingCards.map((profile) => profile.profileName).join(", "),
      profiles: missingCards.map((profile) => profile.profileName),
    }, { status: 409 });
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=stellar-accounts.json",
    },
  });
}

