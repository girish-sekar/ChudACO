import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@chudaco/db";
import { getAllCardVaultRows } from "../src/lib/google-sheets-relay";

const DISCORD_USERNAME = "girishsekar8392";
const EXCLUDED_CARDHOLDER = "Atmaja Raman";
const PROFILES_PER_CARD = 5;
const LAST_ADDRESS_PROFILES = 6;
const ADDRESS_PROFILES = [
  "#2 ACO#1",
  "#3 ACO#2",
  "Atul-1",
  "Atul-2",
  "Atul-3",
  "Bissu-1",
  "Bissu-2",
  "Nitin-1",
  "Nitin-2",
  "Ryen PKC 1",
  "Ryen PKC 2",
  "Vong-1",
];

const inputPath = process.argv[2] ?? "/home/girish-sekar/Downloads/valor-accounts.txt";
const outputPath = process.argv[3] ?? "/home/girish-sekar/Downloads/profile.json";

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

function cardType(brand: string): string {
  const value = brand.trim().toLowerCase();
  if (value.includes("amex") || value.includes("american")) return "amex";
  if (value.includes("master")) return "mastercard";
  if (value.includes("discover")) return "discover";
  if (value.includes("visa")) return "visa";
  return value;
}

function formatCardNumber(value: string, type: string): string {
  const digits = value.replace(/\D/g, "");
  if (type === "amex" && digits.length === 15) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 10)} ${digits.slice(10)}`;
  }
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function readEmails(file: string): string[] {
  const emails = fs.readFileSync(file, "utf8").split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(0, line.indexOf(":") === -1 ? line.length : line.indexOf(":")).trim());
  if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error("Input contains a line without a valid email before the first colon.");
  }
  if (new Set(emails.map((email) => email.toLowerCase())).size !== emails.length) {
    throw new Error("Input contains duplicate emails.");
  }
  return emails;
}

// Spreads leftover profiles one at a time from the first address so counts differ by at most 1.
function addressCounts(total: number): number[] {
  const shared = ADDRESS_PROFILES.length - 1;
  const remaining = total - LAST_ADDRESS_PROFILES;
  const counts = Array.from({ length: shared }, () => Math.floor(remaining / shared));
  for (let index = 0; index < remaining % shared; index += 1) counts[index] += 1;
  return [...counts, LAST_ADDRESS_PROFILES];
}

async function main(): Promise<void> {
  const emails = readEmails(inputPath);

  const user = await prisma.user.findFirst({ where: { username: DISCORD_USERNAME }, select: { id: true } });
  if (!user) throw new Error(`Discord user ${DISCORD_USERNAME} not found.`);

  const profiles = await prisma.acoProfile.findMany({ where: { userId: user.id, name: { in: ADDRESS_PROFILES } } });
  const profileByName = new Map(profiles.map((profile) => [profile.name, profile]));
  const missingProfiles = ADDRESS_PROFILES.filter((name) => !profileByName.has(name));
  if (missingProfiles.length > 0) throw new Error(`Missing address profiles: ${missingProfiles.join(", ")}`);

  const cards = (await prisma.acoCard.findMany({ where: { userId: user.id }, orderBy: { label: "asc" } }))
    .filter((card) => card.cardholderName.trim().toLowerCase() !== EXCLUDED_CARDHOLDER.toLowerCase());
  if (cards.length * PROFILES_PER_CARD !== emails.length) {
    throw new Error(`${cards.length} cards x ${PROFILES_PER_CARD} profiles does not match ${emails.length} accounts.`);
  }

  const vault = await getAllCardVaultRows();
  const vaultCards = cards.map((card) => {
    const entry = vault.get(card.id);
    const number = entry?.cardNumber.replace(/\D/g, "") ?? "";
    if (!entry || !/^\d{13,19}$/.test(number) || !/^\d{3,4}$/.test(entry.cvv.trim()) || number.slice(-4) !== card.last4) {
      throw new Error(`Card "${card.label}" has no valid card-vault entry.`);
    }
    return { card, entry };
  });

  const counts = addressCounts(emails.length);
  const addressForIndex = counts.flatMap((count, index) => Array(count).fill(ADDRESS_PROFILES[index]) as string[]);

  const output: Record<string, unknown> = {};
  emails.forEach((email, index) => {
    const profile = profileByName.get(addressForIndex[index])!;
    const { card, entry } = vaultCards[Math.floor(index / PROFILES_PER_CARD)];
    const type = cardType(entry.cardBrand || card.cardBrand);
    const sameBilling = profile.billingSameAsShipping;
    const shippingName = splitName(profile.shippingName);
    const shippingAddress = splitAddress(profile.shippingAddr);
    const billingName = splitName(sameBilling ? profile.shippingName : profile.billingName ?? profile.shippingName);
    const billingAddress = splitAddress(sameBilling ? profile.shippingAddr : profile.billingAddr ?? profile.shippingAddr);
    const id = crypto.randomUUID();
    output[id] = {
      name: `${DISCORD_USERNAME} - Target #${index + 1}`,
      email,
      phoneNumber: (profile.shippingPhone ?? profile.billingPhone ?? "").trim(),
      billingSameAsShipping: sameBilling,
      oneCheckout: false,
      quickTask: false,
      card: {
        holder: (entry.cardholderName || card.cardholderName).trim(),
        number: formatCardNumber(entry.cardNumber, type),
        expiration: `${String(entry.expMonth || card.expMonth).padStart(2, "0")}/${String(entry.expYear || card.expYear).slice(-2)}`,
        cvv: entry.cvv.trim(),
        type,
      },
      shipping: {
        firstName: shippingName[0],
        lastName: shippingName[1],
        addressLine1: shippingAddress[0],
        addressLine2: shippingAddress[1],
        city: profile.shippingCity ?? "",
        countryName: "United States",
        countryCode: "US",
        state: stateName(profile.shippingState),
        zipCode: profile.shippingZip ?? "",
      },
      billing: {
        firstName: billingName[0],
        lastName: billingName[1],
        addressLine1: billingAddress[0],
        addressLine2: billingAddress[1],
        city: (sameBilling ? profile.shippingCity : profile.billingCity ?? profile.shippingCity) ?? "",
        countryName: "United States",
        countryCode: "US",
        state: stateName(sameBilling ? profile.shippingState : profile.billingState ?? profile.shippingState),
        zipCode: (sameBilling ? profile.shippingZip : profile.billingZip ?? profile.shippingZip) ?? "",
      },
      id,
      totalSpent: 0,
    };
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(outputPath, 0o600);

  console.log(JSON.stringify({
    outputPath,
    profiles: emails.length,
    cards: vaultCards.map(({ card }) => `${card.label} (${card.last4})`),
    addresses: ADDRESS_PROFILES.map((name, index) => `${name}: ${counts[index]}`),
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Profile generation failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
