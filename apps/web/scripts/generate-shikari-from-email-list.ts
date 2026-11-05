import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decrypt, getImapEncryptionKeyFromEnv, prisma } from "@chudaco/db";
import { withRetailerProfile } from "../src/lib/aco-library";
import { getMainSheetRows } from "../src/lib/google-sheets-relay";
import { findSheetCardRow } from "../src/lib/sheet-card";

const RETAILER = "Target";
const MY_USERNAME = "girishsekar8392";
const downloads = path.join(os.homedir(), "Downloads");
const emailsPath = process.argv[2] ?? path.join(downloads, "valor-target-others", "extra.txt");
const myAccountsPath = process.argv[3] ?? path.join(downloads, "valor-accounts.txt");
const myProfilesPath = process.argv[4] ?? path.join(downloads, "profile.json");
const outputDirectory = process.argv[5] ?? path.join(downloads, "shikari-extra");

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

type ValorProfile = {
  name: string;
  email: string;
  phoneNumber: string;
  billingSameAsShipping: boolean;
  card: { number: string; expiration: string; cvv: string };
  shipping: ValorAddress;
  billing: ValorAddress;
};
type ValorAddress = {
  firstName: string;
  lastName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
};
type Mailbox = { host: string; port: number; email: string; password: string };

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function stateCode(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized) return "";
  return Object.entries(STATE_ABBREVIATIONS).find(([name]) => name.toLowerCase() === normalized.toLowerCase())?.[1]
    ?? normalized.toUpperCase();
}

function splitName(value: string | null | undefined): [string, string] {
  const [firstName = "", ...lastName] = (value ?? "").trim().split(/\s+/);
  return [firstName, lastName.join(" ")];
}

function splitAddress(value: string | null | undefined): [string, string] {
  const [street = "", ...extra] = (value ?? "").trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return [street, extra.join(" ")];
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

function validCard(number: string, month: string, year: string, cvv: string): boolean {
  return /^\d{13,19}$/.test(number) && /^(0[1-9]|1[0-2])$/.test(month) && /^\d{4}$/.test(year) && /^\d{3,4}$/.test(cvv);
}

const isTarget = (retailer: string) => retailer.trim().toLowerCase() === RETAILER.toLowerCase();
const imapLine = (mailbox: Mailbox) =>
  [mailbox.host, String(mailbox.port), mailbox.email, mailbox.password].map(csvField).join(",");

function readRequestedEmails(): { emails: string[]; duplicates: number } {
  const seen = new Set<string>();
  const emails: string[] = [];
  let duplicates = 0;
  for (const line of fs.readFileSync(emailsPath, "utf8").split(/\r?\n/)) {
    const email = line.trim();
    if (!email) continue;
    if (seen.has(email.toLowerCase())) {
      duplicates += 1;
      continue;
    }
    seen.add(email.toLowerCase());
    emails.push(email);
  }
  return { emails, duplicates };
}

function readMyCredentials(): Map<string, string> {
  const credentials = new Map<string, string>();
  for (const line of fs.readFileSync(myAccountsPath, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    credentials.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).replace(/\r$/, ""));
  }
  return credentials;
}

function valorProfileRow(profile: ValorProfile): string | null {
  const number = profile.card.number.replace(/\D/g, "");
  const [month = "", rawYear = ""] = profile.card.expiration.split("/").map((part) => part.trim());
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  const cvv = profile.card.cvv.trim();
  if (!validCard(number, month.padStart(2, "0"), year, cvv)) return null;
  const billing = profile.billingSameAsShipping ? profile.shipping : profile.billing;
  return [
    profile.name, profile.shipping.firstName, profile.shipping.lastName, profile.email, profile.phoneNumber,
    number, month.padStart(2, "0"), year, cvv,
    profile.shipping.addressLine1, profile.shipping.addressLine2, profile.shipping.city,
    stateCode(profile.shipping.state), profile.shipping.zipCode, "US",
    billing.firstName, billing.lastName, billing.addressLine1, billing.addressLine2, billing.city,
    stateCode(billing.state), billing.zipCode, "US",
  ].map((value) => csvField(value ?? "")).join(",");
}

async function main(): Promise<void> {
  const { emails, duplicates } = readRequestedEmails();
  const myCredentials = readMyCredentials();
  const myProfiles = new Map(
    (Object.values(JSON.parse(fs.readFileSync(myProfilesPath, "utf8"))) as ValorProfile[])
      .map((profile) => [profile.email.trim().toLowerCase(), profile]),
  );

  const me = await prisma.user.findFirst({ where: { username: MY_USERNAME }, select: { id: true } });
  if (!me) throw new Error(`User ${MY_USERNAME} not found.`);

  const accounts = await prisma.acoAccount.findMany({
    include: {
      cardOnFile: true,
      retailerCards: true,
      retailerLogins: true,
      retailerProfiles: { include: { profile: true } },
    },
  });

  const targetLoginByEmail = new Map<string, Array<{ account: (typeof accounts)[number]; password: string | null }>>();
  const myMailboxesByPassword = new Map<string, Map<string, Mailbox>>();
  const mailboxFor = (account: (typeof accounts)[number]): Mailbox | null => {
    const password = decryptSecret(account.encryptedPassword, account.encryptionIv);
    if (!account.imapHost || !account.email || !password) return null;
    return { host: account.imapHost, port: account.imapPort, email: account.email, password };
  };

  for (const account of accounts) {
    const logins = account.retailerLogins.length > 0
      ? account.retailerLogins
      : [{
          retailer: account.retailer,
          enabled: true,
          loginEmail: account.loginEmail ?? "",
          encryptedLoginPassword: account.encryptedLoginPassword,
          loginPasswordIv: account.loginPasswordIv,
        }];
    for (const login of logins) {
      if (!login.enabled || !isTarget(login.retailer) || !login.loginEmail) continue;
      const password = decryptSecret(login.encryptedLoginPassword, login.loginPasswordIv);
      const key = login.loginEmail.trim().toLowerCase();
      targetLoginByEmail.set(key, [...(targetLoginByEmail.get(key) ?? []), { account, password }]);
      const mailbox = account.userId === me.id ? mailboxFor(account) : null;
      if (mailbox && password) {
        const byPassword = myMailboxesByPassword.get(password) ?? new Map<string, Mailbox>();
        byPassword.set(imapLine(mailbox), mailbox);
        myMailboxesByPassword.set(password, byPassword);
      }
    }
  }

  const sheetRows = await getMainSheetRows();
  const accountLines: string[] = [];
  const imapLines = new Set<string>();
  const profileRows: string[] = [];
  const issues: string[] = [];
  let mine = 0;
  let others = 0;

  for (const email of emails) {
    const key = email.toLowerCase();
    const myPassword = myCredentials.get(key);

    if (myPassword !== undefined) {
      mine += 1;
      accountLines.push(`${email}:${myPassword}`);

      const myDbLogin = targetLoginByEmail.get(key)?.find(({ account }) => account.userId === me.id);
      const dbMailbox = myDbLogin ? mailboxFor(myDbLogin.account) : null;
      // Aliases missing from the DB use the mailbox of DB accounts sharing their Target password.
      const inferred = dbMailbox ? [dbMailbox] : Array.from(myMailboxesByPassword.get(myPassword)?.values() ?? []);
      if (inferred.length === 1) imapLines.add(imapLine(inferred[0]));
      else issues.push(`${email}: ${inferred.length === 0 ? "no" : "ambiguous"} IMAP mailbox`);

      const profile = myProfiles.get(key);
      const row = profile ? valorProfileRow(profile) : null;
      if (row) profileRows.push(row);
      else issues.push(`${email}: ${profile ? "incomplete card in profile.json" : "not in profile.json"}`);
      continue;
    }

    const matches = (targetLoginByEmail.get(key) ?? []).filter(({ account }) => account.userId !== me.id);
    if (matches.length !== 1) {
      issues.push(`${email}: ${matches.length === 0 ? "no enabled Target login in the database" : "multiple Target accounts"}`);
      continue;
    }
    others += 1;
    const { account: loadedAccount, password } = matches[0];

    if (password && !/[:\r\n]/.test(email) && !/[\r\n]/.test(password)) accountLines.push(`${email}:${password}`);
    else issues.push(`${email}: no saved Target password`);

    const mailbox = mailboxFor(loadedAccount);
    if (mailbox) imapLines.add(imapLine(mailbox));
    else issues.push(`${email}: no saved IMAP mailbox/password`);

    const account = withRetailerProfile(loadedAccount, RETAILER);
    const card = account.retailerCards.find((value) => isTarget(value.retailer)) ?? account.cardOnFile;
    const sheetRow = findSheetCardRow(sheetRows, account, card, card ? RETAILER : null);
    const number = (sheetRow?.[5] ?? "").replace(/\D/g, "");
    const cvv = (sheetRow?.[8] ?? "").trim();
    const month = String(sheetRow?.[6] || card?.expMonth || "").trim().padStart(2, "0");
    const rawYear = String(sheetRow?.[7] || card?.expYear || "").trim();
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    if (!validCard(number, month, year, cvv)) {
      issues.push(`${email} (${account.botProfileName}): ${sheetRow ? "incomplete card in payment sheet" : "no matching payment-sheet row"}`);
      continue;
    }

    const sameBilling = account.billingSameAsShipping;
    const shippingName = splitName(account.shippingName ?? account.billingName);
    const shippingAddress = splitAddress(account.shippingAddr);
    const billingName = splitName(sameBilling ? account.shippingName ?? account.billingName : account.billingName ?? account.shippingName);
    const billingAddress = splitAddress(sameBilling ? account.shippingAddr : account.billingAddr);
    profileRows.push([
      account.botProfileName, ...shippingName, email,
      account.shippingPhone ?? account.billingPhone ?? "", number, month, year, cvv,
      ...shippingAddress, account.shippingCity ?? "", stateCode(account.shippingState), account.shippingZip ?? "", "US",
      ...billingName, ...billingAddress,
      (sameBilling ? account.shippingCity : account.billingCity) ?? "",
      stateCode(sameBilling ? account.shippingState : account.billingState),
      (sameBilling ? account.shippingZip : account.billingZip) ?? "", "US",
    ].map(csvField).join(","));
  }

  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(outputDirectory, 0o700);
  const files = [
    { name: "shikari-accounts.txt", contents: accountLines.join("\n"), rows: accountLines.length },
    { name: "shikari-imap.csv", contents: ["imap_server,port,username,password", ...imapLines].join("\r\n"), rows: imapLines.size },
    { name: "shikari-profiles.csv", contents: [PROFILE_HEADER, ...profileRows].join("\r\n"), rows: profileRows.length },
  ];
  for (const file of files) {
    const filePath = path.join(outputDirectory, file.name);
    fs.writeFileSync(filePath, file.contents, { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(filePath, 0o600);
  }

  console.log(JSON.stringify({
    outputDirectory,
    requested: { unique: emails.length, duplicatesIgnored: duplicates, mine, others },
    files: files.map(({ name, rows }) => ({ name, rows })),
    issues,
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Shikari export failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
