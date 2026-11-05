import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decrypt, getImapEncryptionKeyFromEnv, prisma } from "@chudaco/db";
import { withRetailerProfile } from "../src/lib/aco-library";
import { resolveExportEmail } from "../src/lib/export-email";
import { getMainSheetRows } from "../src/lib/google-sheets-relay";
import { findSheetCardRow } from "../src/lib/sheet-card";

const RETAILER = "Target";
const EXCLUDED_USERNAME = process.argv[2] ?? "girishsekar8392";
const OUTPUT_DIRECTORY = process.argv[3] ?? path.join(os.homedir(), "Downloads", "valor-target-others");

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

function stateName(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  return STATE_NAMES[normalized.toUpperCase()]
    ?? Object.values(STATE_NAMES).find((name) => name.toLowerCase() === normalized.toLowerCase())
    ?? normalized;
}

function splitName(value: string | null | undefined): [string, string] {
  const [firstName = "", ...lastName] = (value ?? "").trim().split(/\s+/);
  return [firstName, lastName.join(" ")];
}

function splitAddress(value: string | null | undefined): [string, string] {
  const [street = "", ...extra] = (value ?? "").trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return [street, extra.join(" ")];
}

function cardType(brand: string | null | undefined): string {
  const value = (brand ?? "").trim().toLowerCase();
  if (value.includes("amex") || value.includes("american")) return "amex";
  if (value.includes("master")) return "mastercard";
  if (value.includes("discover")) return "discover";
  if (value.includes("visa")) return "visa";
  return value;
}

function formatCardNumber(digits: string, type: string): string {
  if (type === "amex" && digits.length === 15) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 10)} ${digits.slice(10)}`;
  }
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function twoDigits(value: string | number | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? digits.slice(-2).padStart(2, "0") : "";
}

function decryptSecret(value: string | null | undefined, iv: string | null | undefined): string | null {
  if (!value || !iv) return null;
  const [ciphertext, authTag] = value.split(":");
  if (!ciphertext || !authTag) return null;
  try {
    return decrypt(ciphertext, iv, authTag, getImapEncryptionKeyFromEnv());
  } catch {
    throw new Error("Credential decryption failed; verify IMAP_ENCRYPTION_KEY.");
  }
}

const isTarget = (retailer: string) => retailer.trim().toLowerCase() === RETAILER.toLowerCase();

async function main(): Promise<void> {
  const excludedUser = await prisma.user.findFirst({ where: { username: EXCLUDED_USERNAME }, select: { id: true } });
  if (!excludedUser) throw new Error(`User ${EXCLUDED_USERNAME} not found; refusing to export without the exclusion.`);

  const accounts = await prisma.acoAccount.findMany({
    where: {
      userId: { not: excludedUser.id },
      OR: [
        { retailer: { equals: RETAILER, mode: "insensitive" } },
        { retailerLogins: { some: { retailer: { equals: RETAILER, mode: "insensitive" } } } },
      ],
    },
    orderBy: [{ user: { username: "asc" } }, { accountNumber: "asc" }],
    include: {
      user: { select: { username: true } },
      imapConfig: true,
      cardOnFile: true,
      retailerCards: true,
      retailerLogins: true,
      retailerProfiles: { include: { profile: true } },
    },
  });

  const sheetRows = await getMainSheetRows();
  const accountLines: string[] = [];
  const imapLines = new Set<string>();
  const profiles: Record<string, unknown> = {};
  const skipped = { logins: [] as string[], imap: [] as string[], profiles: [] as string[] };
  const users = new Set<string>();

  for (const loadedAccount of accounts) {
    const logins = (loadedAccount.retailerLogins.length > 0
      ? loadedAccount.retailerLogins
      : [{
          retailer: loadedAccount.retailer,
          enabled: true,
          loginEmail: loadedAccount.loginEmail ?? "",
          encryptedLoginPassword: loadedAccount.encryptedLoginPassword,
          loginPasswordIv: loadedAccount.loginPasswordIv,
        }]).filter((login) => login.enabled && isTarget(login.retailer));
    if (logins.length === 0) continue;
    users.add(loadedAccount.user.username);
    const label = loadedAccount.botProfileName;

    for (const login of logins) {
      const password = decryptSecret(login.encryptedLoginPassword, login.loginPasswordIv);
      if (!login.loginEmail || !password || /[:\r\n]/.test(login.loginEmail) || /[\r\n]/.test(password)) {
        skipped.logins.push(label);
        continue;
      }
      accountLines.push(`${login.loginEmail}:${password}`);
    }

    const imapEmail = loadedAccount.imapConfig?.email ?? loadedAccount.email;
    const imapPassword = decryptSecret(
      loadedAccount.imapConfig?.encryptedPassword ?? loadedAccount.encryptedPassword,
      loadedAccount.imapConfig?.encryptionIv ?? loadedAccount.encryptionIv,
    );
    if (!imapEmail || !imapPassword || /[:\r\n]/.test(imapEmail) || /[\r\n]/.test(imapPassword)) {
      skipped.imap.push(label);
    } else {
      imapLines.add(`${imapEmail}:${imapPassword}`);
    }

    const account = withRetailerProfile(loadedAccount, RETAILER);
    const card = account.retailerCards.find((value) => isTarget(value.retailer)) ?? account.cardOnFile;
    const row = findSheetCardRow(sheetRows, account, card, card ? RETAILER : null);
    const number = (row?.[5] ?? "").replace(/\D/g, "");
    const cvv = (row?.[8] ?? "").trim();
    const month = twoDigits(row?.[6] || card?.expMonth);
    const year = twoDigits(row?.[7] || card?.expYear);
    if (!/^\d{13,19}$/.test(number) || !/^\d{3,4}$/.test(cvv) || !/^(0[1-9]|1[0-2])$/.test(month) || !year) {
      skipped.profiles.push(`${label}: ${row ? "incomplete card in payment sheet" : "no matching payment-sheet row"}`);
      continue;
    }

    const type = cardType(row?.[4] || card?.cardBrand);
    const sameBilling = account.billingSameAsShipping;
    const shippingName = splitName(account.shippingName ?? account.billingName ?? account.botProfileName);
    const billingName = splitName(sameBilling
      ? account.shippingName ?? account.billingName
      : account.billingName ?? account.shippingName);
    const shippingAddress = splitAddress(account.shippingAddr);
    const billingAddress = splitAddress(sameBilling ? account.shippingAddr : account.billingAddr ?? account.shippingAddr);

    profiles[account.id] = {
      name: account.botProfileName,
      email: resolveExportEmail(account, RETAILER),
      phoneNumber: (account.shippingPhone ?? account.billingPhone ?? "").trim(),
      billingSameAsShipping: sameBilling,
      oneCheckout: account.onlyOneCheckout,
      quickTask: false,
      card: {
        holder: (row?.[3] || card?.cardholderName || shippingName.join(" ")).trim(),
        number: formatCardNumber(number, type),
        expiration: `${month}/${year}`,
        cvv,
        type,
      },
      shipping: {
        firstName: shippingName[0],
        lastName: shippingName[1],
        addressLine1: shippingAddress[0],
        addressLine2: shippingAddress[1],
        city: account.shippingCity ?? "",
        countryName: "United States",
        countryCode: "US",
        state: stateName(account.shippingState),
        zipCode: account.shippingZip ?? "",
      },
      billing: {
        firstName: billingName[0],
        lastName: billingName[1],
        addressLine1: billingAddress[0],
        addressLine2: billingAddress[1],
        city: (sameBilling ? account.shippingCity : account.billingCity ?? account.shippingCity) ?? "",
        countryName: "United States",
        countryCode: "US",
        state: stateName(sameBilling ? account.shippingState : account.billingState ?? account.shippingState),
        zipCode: (sameBilling ? account.shippingZip : account.billingZip ?? account.shippingZip) ?? "",
      },
      id: account.id,
      totalSpent: 0,
    };
  }

  fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true, mode: 0o700 });
  fs.chmodSync(OUTPUT_DIRECTORY, 0o700);
  const files = [
    { name: "valor-accounts.txt", contents: accountLines.join("\n"), rows: accountLines.length },
    { name: "valor-imap.txt", contents: Array.from(imapLines).join("\n"), rows: imapLines.size },
    { name: "profile.json", contents: JSON.stringify(profiles, null, 2), rows: Object.keys(profiles).length },
  ];
  for (const file of files) {
    const filePath = path.join(OUTPUT_DIRECTORY, file.name);
    fs.writeFileSync(filePath, file.contents, { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(filePath, 0o600);
  }

  console.log(JSON.stringify({
    outputDirectory: OUTPUT_DIRECTORY,
    excludedUser: EXCLUDED_USERNAME,
    users: users.size,
    targetAccounts: accounts.filter((account) => users.has(account.user.username)).length,
    files: files.map(({ name, rows }) => ({ name, rows })),
    skipped,
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Valor Target export failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
