import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decrypt, getImapEncryptionKeyFromEnv, prisma } from "@chudaco/db";
import { google } from "googleapis";
import { resolveExportEmail } from "../src/lib/export-email";
import { getGoogleSheetsConfig } from "../src/lib/payment-info";
import { findSheetCardRow } from "../src/lib/sheet-card";
import { withRetailerProfile } from "../src/lib/aco-library";
import { splitTargetAccountsByOwner, splitTargetProfilesByOwner } from "../src/lib/target-account-split";

const TARGET = "target";
const PROFILE_HEADER = "profile_name,first_name,last_name,email,phone_num,cc_number,cc_exp_month,cc_exp_year,cc_cvv,shipping_street,shipping_street_2,shipping_city,shipping_state,shipping_zip_code,shipping_country,billing_first_name,billing_last_name,billing_street,billing_street_2,billing_city,billing_state,billing_zip_code,billing_country";
const STATE_ABBREVIATIONS: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
  Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA",
  Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT",
  Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
  Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI",
  "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI",
  Wyoming: "WY", "District of Columbia": "DC",
};

type RetailerLoginEntry = {
  retailer: string;
  enabled: boolean;
  loginEmail: string | null;
  encryptedLoginPassword: string | null;
  loginPasswordIv: string | null;
};

type AccountLoginSource = {
  retailer: string;
  loginEmail: string | null;
  encryptedLoginPassword: string | null;
  loginPasswordIv: string | null;
  retailerLogins: RetailerLoginEntry[];
};

function targetEntries(account: AccountLoginSource): RetailerLoginEntry[] {
  const entries = account.retailerLogins.length > 0
    ? account.retailerLogins
    : [{
        retailer: account.retailer,
        enabled: true,
        loginEmail: account.loginEmail,
        encryptedLoginPassword: account.encryptedLoginPassword,
        loginPasswordIv: account.loginPasswordIv,
      }];
  return entries.filter((entry) => entry.enabled && entry.retailer.trim().toLowerCase() === TARGET);
}

function decryptSecret(value: string | null, iv: string | null): string | null {
  if (!value || !iv) return null;
  const [ciphertext, authTag] = value.split(":");
  if (!ciphertext || !authTag) return null;
  try {
    return decrypt(ciphertext, iv, authTag, getImapEncryptionKeyFromEnv());
  } catch {
    throw new Error("Credential decryption failed; verify IMAP_ENCRYPTION_KEY.");
  }
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function splitName(value: string | null | undefined): [string, string] {
  const [firstName = "", ...lastName] = (value ?? "").trim().split(/\s+/);
  return [firstName, lastName.join(" ")];
}

function splitAddress(value: string | null | undefined): [string, string] {
  const [street = "", ...extra] = (value ?? "").trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return [street, extra.join(" ")];
}

function valorStateName(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized) return "";
  const namesByAbbreviation = Object.fromEntries(
    Object.entries(STATE_ABBREVIATIONS).map(([name, abbreviation]) => [abbreviation, name]),
  );
  const fullName = namesByAbbreviation[normalized.toUpperCase()];
  if (fullName) return fullName;
  return Object.keys(STATE_ABBREVIATIONS).find((name) => name.toLowerCase() === normalized.toLowerCase()) ?? normalized;
}

function shikariState(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized) return "";
  return Object.entries(STATE_ABBREVIATIONS).find(([name]) => name.toLowerCase() === normalized.toLowerCase())?.[1]
    ?? normalized.toUpperCase();
}

function formatExpYear(value: string | number | null | undefined): string {
  const digits = String(value ?? "").trim().replace(/[^0-9]/g, "");
  if (digits.length === 2) return `20${digits}`;
  return digits.length >= 4 ? digits.slice(0, 4) : digits;
}

function formatExpMonth(value: string | number | null | undefined): string {
  const digits = String(value ?? "").trim().replace(/[^0-9]/g, "");
  if (!digits) return "";
  const numeric = Number(digits);
  return Number.isFinite(numeric) && numeric >= 1 && numeric <= 12
    ? String(numeric).padStart(2, "0")
    : digits.padStart(2, "0");
}

function normalizeCardType(value: string | null | undefined): string {
  const type = (value ?? "").trim().toLowerCase();
  if (!type) return "";
  if (type.includes("amex")) return "amex";
  if (type.includes("visa")) return "visa";
  if (type.includes("mastercard") || type.includes("mc")) return "mastercard";
  if (type.includes("discover")) return "discover";
  return type;
}

function formatValorCardNumber(value: string, cardType: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 12 || digits.length > 19) return value;
  if (cardType === "amex" && digits.length === 15) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 10)} ${digits.slice(10)}`;
  }
  if (["visa", "mastercard", "discover"].includes(cardType)) {
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  }
  return value;
}

async function loadSheetRows(): Promise<string[][]> {
  const { spreadsheetId, sheetName, keyPath } = getGoogleSheetsConfig();
  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:AD` });
  return (response.data.values ?? []).map((row) => row.map((value) => String(value ?? "")));
}

async function main(): Promise<void> {
  const profileExportsOnly = process.argv.includes("--profiles-only");
  const accounts = await prisma.acoAccount.findMany({
    where: {
      OR: [
        { retailer: { equals: "Target", mode: "insensitive" } },
        { retailerLogins: { some: { retailer: { equals: "Target", mode: "insensitive" }, enabled: true } } },
      ],
    },
    orderBy: [{ userId: "asc" }, { accountNumber: "asc" }, { id: "asc" }],
    include: {
      imapConfig: true,
      cardOnFile: true,
      retailerLogins: true,
      retailerCards: true,
      retailerProfiles: { include: { profile: true } },
    },
  });

  const eligible = accounts.filter((account) => targetEntries(account).length > 0);
  const { valor, shikari } = splitTargetAccountsByOwner(eligible);
  const {
    valor: valorProfileAccounts,
    shikari: shikariProfileAccounts,
  } = splitTargetProfilesByOwner(eligible);
  if (valor.length + shikari.length !== eligible.length) {
    throw new Error("Account split validation failed.");
  }

  const sheetRows = await loadSheetRows();
  let skippedValorAccounts = 0;
  let skippedShikariAccounts = 0;
  let skippedShikariProfiles = 0;
  const valorAccountLines: string[] = [];
  const shikariAccountLines: string[] = [];
  const valorImapLines = new Set<string>();
  const shikariImapLines = new Set<string>();

  if (!profileExportsOnly) {
    for (const [assigned, accountLines, skippedCounter] of [
      [valor, valorAccountLines, "valor"] as const,
      [shikari, shikariAccountLines, "shikari"] as const,
    ]) {
      for (const account of assigned) {
        for (const entry of targetEntries(account)) {
          const password = decryptSecret(entry.encryptedLoginPassword, entry.loginPasswordIv);
          if (!entry.loginEmail || !password) {
            if (skippedCounter === "valor") skippedValorAccounts += 1;
            else skippedShikariAccounts += 1;
            continue;
          }
          if (/[:\r\n]/.test(entry.loginEmail) || /[\r\n]/.test(password)) {
            throw new Error("A retailer credential cannot be represented in username:password format.");
          }
          accountLines.push(`${entry.loginEmail}:${password}`);
        }
      }
    }

    for (const account of valor) {
      if (targetEntries(account).length === 0) continue;
      const email = account.imapConfig?.email ?? account.email;
      const password = decryptSecret(
        account.imapConfig?.encryptedPassword ?? account.encryptedPassword,
        account.imapConfig?.encryptionIv ?? account.encryptionIv,
      );
      if (!email || !password || /[:\r\n]/.test(email) || /[\r\n]/.test(password)) continue;
      valorImapLines.add(`${email}:${password}`);
    }

    for (const account of shikari) {
      if (targetEntries(account).length === 0 || !account.imapHost || !account.email) continue;
      const password = decryptSecret(account.encryptedPassword, account.encryptionIv);
      if (!password) continue;
      shikariImapLines.add([
        account.imapHost,
        String(account.imapPort),
        account.email,
        password,
      ].map(csvField).join(","));
    }
  }

  const valorProfiles: Record<string, unknown> = {};
  for (const loadedAccount of valorProfileAccounts) {
    if (targetEntries(loadedAccount).length === 0) continue;
    const account = withRetailerProfile(loadedAccount, "Target");
    const selectedCard = account.retailerCards.find((card) => card.retailer.toLowerCase() === TARGET)
      ?? account.cardOnFile;
    const matchingRow = findSheetCardRow(sheetRows, account, selectedCard, selectedCard ? "Target" : null);
    const shippingName = splitName(account.shippingName ?? account.billingName ?? account.botProfileName);
    const billingName = splitName(account.billingSameAsShipping
      ? account.shippingName ?? account.billingName
      : account.billingName ?? account.shippingName);
    const shippingAddress = splitAddress(account.shippingAddr);
    const billingAddress = splitAddress(account.billingSameAsShipping ? account.shippingAddr : account.billingAddr);
    const cardNumber = matchingRow?.[5] ?? (selectedCard?.last4 ? `•••• ${selectedCard.last4}` : "");
    const cardMonth = formatExpMonth(matchingRow?.[6] ?? selectedCard?.expMonth);
    const cardYear = formatExpYear(matchingRow?.[7] ?? selectedCard?.expYear);
    const cardType = normalizeCardType(matchingRow?.[4] || selectedCard?.cardBrand);

    valorProfiles[account.id] = {
      name: account.botProfileName,
      email: resolveExportEmail(account, "Target"),
      phoneNumber: (account.shippingPhone ?? account.billingPhone ?? "").trim(),
      billingSameAsShipping: account.billingSameAsShipping,
      oneCheckout: account.onlyOneCheckout,
      quickTask: false,
      card: {
        holder: (matchingRow?.[3] ?? selectedCard?.cardholderName ?? `${shippingName[0]} ${shippingName[1]}`).trim(),
        number: formatValorCardNumber(cardNumber, cardType),
        expiration: cardMonth && cardYear ? `${cardMonth}/${cardYear.slice(-2)}` : "",
        cvv: matchingRow?.[8] ?? "",
        type: cardType,
      },
      shipping: {
        firstName: shippingName[0],
        lastName: shippingName[1],
        addressLine1: shippingAddress[0],
        addressLine2: shippingAddress[1],
        city: account.shippingCity ?? "",
        countryName: "United States",
        countryCode: "US",
        state: valorStateName(account.shippingState),
        zipCode: account.shippingZip ?? "",
      },
      billing: {
        firstName: billingName[0],
        lastName: billingName[1],
        addressLine1: billingAddress[0],
        addressLine2: billingAddress[1],
        city: account.billingCity ?? account.shippingCity ?? "",
        countryName: "United States",
        countryCode: "US",
        state: valorStateName(account.billingState ?? account.shippingState),
        zipCode: account.billingZip ?? account.shippingZip ?? "",
      },
      id: account.id,
      totalSpent: 0,
    };
  }

  const shikariProfileRows = new Set<string>();
  for (const loadedAccount of shikariProfileAccounts) {
    for (const entry of targetEntries(loadedAccount)) {
      const account = withRetailerProfile(loadedAccount, entry.retailer);
      const card = account.retailerCards.find((value) => value.retailer.toLowerCase() === entry.retailer.toLowerCase())
        ?? account.cardOnFile;
      const sheetRow = findSheetCardRow(sheetRows, account, card, card ? entry.retailer : null);
      const cardNumber = (sheetRow?.[5] ?? "").replace(/[\s-]/g, "");
      const cvv = (sheetRow?.[8] ?? "").trim();
      const month = String(sheetRow?.[6] || card?.expMonth || "").trim().padStart(2, "0");
      const rawYear = String(sheetRow?.[7] || card?.expYear || "").trim();
      const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
      if (!/^\d{13,19}$/.test(cardNumber) || !/^\d{3,4}$/.test(cvv)
        || !/^(0[1-9]|1[0-2])$/.test(month) || !/^\d{4}$/.test(year)) {
        skippedShikariProfiles += 1;
        continue;
      }

      const shippingName = splitName(account.shippingName ?? account.billingName);
      const shippingAddress = splitAddress(account.shippingAddr);
      const sameBilling = account.billingSameAsShipping;
      const billingName = splitName(sameBilling
        ? account.shippingName ?? account.billingName
        : account.billingName ?? account.shippingName);
      const billingAddress = splitAddress(sameBilling ? account.shippingAddr : account.billingAddr);
      shikariProfileRows.add([
        account.botProfileName,
        ...shippingName,
        resolveExportEmail(account, entry.retailer),
        account.shippingPhone ?? account.billingPhone ?? "",
        cardNumber,
        month,
        year,
        cvv,
        ...shippingAddress,
        account.shippingCity ?? "",
        shikariState(account.shippingState),
        account.shippingZip ?? "",
        "US",
        ...billingName,
        ...billingAddress,
        (sameBilling ? account.shippingCity : account.billingCity) ?? "",
        shikariState(sameBilling ? account.shippingState : account.billingState),
        (sameBilling ? account.shippingZip : account.billingZip) ?? "",
        "US",
      ].map(csvField).join(","));
    }
  }

  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = path.resolve(scriptDirectory, "../../..");
  const outputDirectory = path.join(repositoryRoot, ".private-exports", "target-account-split");
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(outputDirectory, 0o700);

  const files = [
    { name: "valor-accounts.txt", contents: valorAccountLines.join("\n"), rows: valorAccountLines.length },
    { name: "valor-imap.txt", contents: Array.from(valorImapLines).join("\n"), rows: valorImapLines.size },
    { name: "valor-profiles.json", contents: JSON.stringify(valorProfiles, null, 2), rows: Object.keys(valorProfiles).length },
    { name: "shikari-accounts.txt", contents: shikariAccountLines.join("\n"), rows: shikariAccountLines.length },
    { name: "shikari-imap.csv", contents: ["imap_server,port,username,password", ...shikariImapLines].join("\r\n"), rows: shikariImapLines.size },
    { name: "shikari-profiles.csv", contents: [PROFILE_HEADER, ...shikariProfileRows].join("\r\n"), rows: shikariProfileRows.size },
  ];
  const outputFiles = profileExportsOnly
    ? files.filter((file) => file.name.endsWith("-profiles.json") || file.name.endsWith("-profiles.csv"))
    : files;

  for (const file of outputFiles) {
    const outputPath = path.join(outputDirectory, file.name);
    fs.writeFileSync(outputPath, file.contents, { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(outputPath, 0o600);
  }

  console.log(JSON.stringify({
    eligibleTargetAccounts: eligible.length,
    owners: new Set(eligible.map((account) => account.userId)).size,
    assignedProfiles: { valor: valorProfileAccounts.length, shikari: shikariProfileAccounts.length },
    ...(profileExportsOnly ? {} : {
      assignedAccounts: { valor: valor.length, shikari: shikari.length },
      skippedRetailerCredentialEntries: { valor: skippedValorAccounts, shikari: skippedShikariAccounts },
    }),
    skippedShikariProfiles,
    shikariProfileAccountCount: shikariProfileAccounts.length,
    outputDirectory: path.relative(repositoryRoot, outputDirectory),
    files: outputFiles.map(({ name, rows }) => ({ name, rows })),
  }, null, 2));
}

main()
  .catch(() => {
    console.error("Target export generation failed; check database, Google Sheets, and encryption configuration.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });