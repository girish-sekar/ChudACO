import { decrypt, getImapEncryptionKeyFromEnv, prisma } from "@chudaco/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDiscordIds, getAuthenticatedContext } from "@/lib/api-auth";
import { accountIdFilter } from "@/lib/admin-export";
import { google } from "googleapis";
import { getGoogleSheetsConfig } from "@/lib/payment-info";
import { findSheetCardRow } from "@/lib/sheet-card";
import { withRetailerProfile } from "@/lib/aco-library";
import { resolveExportEmail } from "@/lib/export-email";

const querySchema = z.object({
  mode: z.enum(["accounts", "imap", "profiles"]).default("accounts"),
  retailers: z.string().trim().min(1).optional(),
});

function decryptPassword(value: string | null, iv: string | null): string | null {
  if (!value || !iv) return null;
  const [ciphertext, authTag] = value.split(":");
  if (!ciphertext || !authTag) return null;
  return decrypt(ciphertext, iv, authTag, getImapEncryptionKeyFromEnv());
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function splitName(value: string | null | undefined): string[] {
  const [firstName = "", ...lastName] = (value ?? "").trim().split(/\s+/);
  return [firstName, lastName.join(" ")];
}

function splitAddress(value: string | null | undefined): string[] {
  const [street = "", ...extra] = (value ?? "").trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return [street, extra.join(" ")];
}

export async function GET(request: NextRequest) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!getAdminDiscordIds().has(authContext.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = querySchema.safeParse({
    mode: request.nextUrl.searchParams.get("mode") ?? undefined,
    retailers: request.nextUrl.searchParams.get("retailers") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }
  const retailers = Array.from(new Set(
    (parsed.data.retailers ?? "Target").split(",").map((value) => value.trim()).filter(Boolean),
  ));
  if (retailers.length === 0) {
    return NextResponse.json({ error: "Select at least one retailer." }, { status: 400 });
  }

  const accounts = await prisma.acoAccount.findMany({
    where: {
      ...accountIdFilter(request),
      OR: retailers.flatMap((retailer) => [
        { retailer: { equals: retailer, mode: "insensitive" as const } },
        { retailerLogins: { some: { retailer: { equals: retailer, mode: "insensitive" as const }, enabled: true } } },
      ]),
    },
    orderBy: [{ retailer: "asc" }, { label: "asc" }],
    include: {
      retailerLogins: true,
      cardOnFile: true,
      retailerCards: true,
      retailerProfiles: { include: { profile: true } },
    },
  });

  if (parsed.data.mode === "profiles") {
    const header = "profile_name,first_name,last_name,email,phone_num,cc_number,cc_exp_month,cc_exp_year,cc_cvv,shipping_street,shipping_street_2,shipping_city,shipping_state,shipping_zip_code,shipping_country,billing_first_name,billing_last_name,billing_street,billing_street_2,billing_city,billing_state,billing_zip_code,billing_country";
    const rows = new Set<string>();
    const skippedProfiles: string[] = [];
    try {
      const { spreadsheetId, sheetName, keyPath } = getGoogleSheetsConfig();
      const auth = new google.auth.GoogleAuth({
        keyFile: keyPath,
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      });
      const sheets = google.sheets({ version: "v4", auth });
      const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:AD` });
      const sheetRows = (response.data.values ?? []).map((row) => row.map((value) => String(value ?? "")));
      for (const loadedAccount of accounts) {
        const entries = (loadedAccount.retailerLogins.length > 0
          ? loadedAccount.retailerLogins
          : [{ retailer: loadedAccount.retailer, enabled: true }])
          .filter((entry) => entry.enabled && retailers.some(
            (retailer) => retailer.toLowerCase() === entry.retailer.toLowerCase(),
          ));
        for (const entry of entries) {
          const account = withRetailerProfile(loadedAccount, entry.retailer);
          const card = account.retailerCards.find((value) => value.retailer.toLowerCase() === entry.retailer.toLowerCase()) ?? account.cardOnFile;
          const sheetRow = findSheetCardRow(sheetRows, account, card, card ? entry.retailer : null);
          const cardNumber = (sheetRow?.[5] ?? "").replace(/[\s-]/g, "");
          const cvv = (sheetRow?.[8] ?? "").trim();
          const month = String(sheetRow?.[6] || card?.expMonth || "").trim().padStart(2, "0");
          const rawYear = String(sheetRow?.[7] || card?.expYear || "").trim();
          const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
          const invalidFields = [
            !/^\d{13,19}$/.test(cardNumber) ? "card number" : null,
            !/^\d{3,4}$/.test(cvv) ? "CVV" : null,
            !/^(0[1-9]|1[0-2])$/.test(month) ? "expiration month" : null,
            !/^\d{4}$/.test(year) ? "expiration year" : null,
          ].filter(Boolean);
          if (invalidFields.length > 0) {
            skippedProfiles.push(`Shikari profile "${account.botProfileName}" (${entry.retailer}) has missing or invalid ${invalidFields.join(", ")}. ${sheetRow ? "Update its payment information before exporting." : "No matching payment-sheet row was found for its selected card."}`);
            continue;
          }
          const shippingName = splitName(account.shippingName ?? account.billingName);
          const shippingAddress = splitAddress(account.shippingAddr);
          const sameBilling = account.billingSameAsShipping;
          const billingName = splitName(sameBilling ? account.shippingName ?? account.billingName : account.billingName ?? account.shippingName);
          const billingAddress = splitAddress(sameBilling ? account.shippingAddr : account.billingAddr);
          rows.add([
            account.botProfileName, ...shippingName, resolveExportEmail(account, entry.retailer),
            account.shippingPhone ?? account.billingPhone ?? "", cardNumber, month, year, cvv,
            ...shippingAddress, account.shippingCity ?? "", account.shippingState ?? "", account.shippingZip ?? "", "US",
            ...billingName, ...billingAddress,
            (sameBilling ? account.shippingCity : account.billingCity) ?? "",
            (sameBilling ? account.shippingState : account.billingState) ?? "",
            (sameBilling ? account.shippingZip : account.billingZip) ?? "", "US",
          ].map(csvField).join(","));
        }
      }
    } catch {
      return NextResponse.json({ error: "Unable to load Shikari profile payment details. Check the Google Sheets configuration." }, { status: 500 });
    }
    if (rows.size === 0 && skippedProfiles.length > 0) {
      return NextResponse.json({ error: skippedProfiles[0] }, { status: 400 });
    }
    return new NextResponse([header, ...rows].join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="shikari-profiles.csv"',
        "Cache-Control": "no-store",
        "X-Export-Skipped-Count": String(skippedProfiles.length),
        "X-Export-Warning": skippedProfiles.length > 0
          ? encodeURIComponent(`Downloaded complete profiles. Skipped ${skippedProfiles.length} incomplete profile(s). ${skippedProfiles[0]}`)
          : "",
      },
    });
  }

  const lines = new Set<string>();
  try {
    for (const account of accounts) {
      const entries = (account.retailerLogins.length > 0
        ? account.retailerLogins
        : [{ ...account, enabled: true }])
        .filter((entry) => entry.enabled && retailers.some(
          (retailer) => retailer.toLowerCase() === entry.retailer.toLowerCase(),
        ));
      if (entries.length === 0) continue;

      if (parsed.data.mode === "imap") {
        if (!account.imapHost || !account.email) continue;
        const password = decryptPassword(account.encryptedPassword, account.encryptionIv);
        if (!password) continue;
        lines.add([account.imapHost, String(account.imapPort), account.email, password].map(csvField).join(","));
      } else {
        for (const entry of entries) {
          if (!entry.loginEmail) continue;
          const password = decryptPassword(entry.encryptedLoginPassword, entry.loginPasswordIv);
          if (!password) continue;
          if (/[:\r\n]/.test(entry.loginEmail) || /[\r\n]/.test(password)) {
            return NextResponse.json({ error: "A retailer credential cannot be represented in username:password format." }, { status: 400 });
          }
          lines.add(`${entry.loginEmail}:${password}`);
        }
      }
    }
  } catch {
    return NextResponse.json({ error: "Unable to decrypt Shikari credentials. Check the encryption configuration." }, { status: 500 });
  }

  const isImap = parsed.data.mode === "imap";
  const rows = isImap ? ["imap_server,port,username,password", ...lines] : Array.from(lines);
  return new NextResponse(rows.join("\r\n"), {
    headers: {
      "Content-Type": isImap ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="shikari-${isImap ? "imap.csv" : "accounts.txt"}"`,
      "Cache-Control": "no-store",
    },
  });
}