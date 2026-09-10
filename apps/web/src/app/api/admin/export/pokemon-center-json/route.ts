import { prisma } from "@chudaco/db";
import { google } from "googleapis";
import { NextResponse } from "next/server";
import { getAdminDiscordIds, getAuthenticatedContext } from "@/lib/api-auth";
import { getGoogleSheetsConfig } from "@/lib/payment-info";

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

export async function GET() {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admins = getAdminDiscordIds();
  if (!admins.has(authContext.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accounts = await prisma.acoAccount.findMany({
    where: {
      OR: [
        { retailer: { equals: "Pokemon Center", mode: "insensitive" } },
        {
          retailerLogins: {
            some: {
              retailer: { equals: "Pokemon Center", mode: "insensitive" },
            },
          },
        },
      ],
    },
    orderBy: [{ retailer: "asc" }, { label: "asc" }],
    include: {
      cardOnFile: true,
    },
  });

  const sheetRows = await getGoogleSheetRows();
  const payload = accounts.map((account) => {
    const matchingRow = findMatchingSheetRow(sheetRows, account);
    const shippingName = splitName(account.shippingName ?? account.billingName ?? account.botProfileName ?? "");
    const billingName = splitName(account.billingSameAsShipping ? account.shippingName ?? account.billingName : account.billingName ?? account.shippingName ?? "");
    const shippingAddress = buildAddressBlock(account.shippingAddr, account.shippingCity, account.shippingState, account.shippingZip);
    const billingAddress = buildAddressBlock(
      account.billingSameAsShipping ? account.shippingAddr ?? account.billingAddr : account.billingAddr,
      account.billingSameAsShipping ? account.shippingCity ?? account.billingCity : account.billingCity,
      account.billingSameAsShipping ? account.shippingState ?? account.billingState : account.billingState,
      account.billingSameAsShipping ? account.shippingZip ?? account.billingZip : account.billingZip,
    );

    const sheetCardNumber = matchingRow?.[5] ?? "";
    const sheetCvv = matchingRow?.[8] ?? "";
    const sheetCardType = matchingRow?.[4] ?? account.cardOnFile?.cardBrand ?? "";
    const sheetCardholderName = matchingRow?.[3] ?? account.cardOnFile?.cardholderName ?? "";
    const sheetExpMonth = formatExpMonth(matchingRow?.[6] ?? (account.cardOnFile?.expMonth != null ? String(account.cardOnFile.expMonth) : ""));
    const sheetExpYear = formatExpYear(matchingRow?.[7] ?? (account.cardOnFile?.expYear != null ? String(account.cardOnFile.expYear) : ""));

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
        cardName: sheetCardholderName || account.cardOnFile?.cardholderName || (account.billingSameAsShipping ? `${shippingName.firstName} ${shippingName.lastName}`.trim() : `${billingName.firstName} ${billingName.lastName}`.trim()),
        cardType: sheetCardType || account.cardOnFile?.cardBrand || "",
        cardNumber: sheetCardNumber,
        cardMonth: sheetExpMonth,
        cardYear: sheetExpYear,
        cardCvv: sheetCvv,
      },
    };
  });

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=pokemon-center-accounts.json",
    },
  });
}
