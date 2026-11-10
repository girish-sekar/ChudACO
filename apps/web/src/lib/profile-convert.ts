export type ConvertFormat = "shikari" | "valor" | "polar";
export type SourceFormat = "shikari" | "valor";

export type ProfileAddress = {
  firstName: string;
  lastName: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
};

export type ConvertibleProfile = {
  name: string;
  email: string;
  phone: string;
  cardHolder: string;
  cardNumber: string;
  cardMonth: string;
  cardYear: string;
  cardCvv: string;
  cardType: string;
  sameBilling: boolean;
  shipping: ProfileAddress;
  billing: ProfileAddress;
};

export type ConvertResult = {
  content: string;
  filename: string;
  contentType: string;
  matched: number;
  issues: string[];
};

export const SHIKARI_HEADER = [
  "profile_name", "first_name", "last_name", "email", "phone_num",
  "cc_number", "cc_exp_month", "cc_exp_year", "cc_cvv",
  "shipping_street", "shipping_street_2", "shipping_city", "shipping_state",
  "shipping_zip_code", "shipping_country",
  "billing_first_name", "billing_last_name", "billing_street", "billing_street_2",
  "billing_city", "billing_state", "billing_zip_code", "billing_country",
];

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

const STATE_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_ABBREVIATIONS).map(([name, code]) => [code, name]),
);

export function stateCode(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized) return "";
  const match = Object.entries(STATE_ABBREVIATIONS).find(
    ([name]) => name.toLowerCase() === normalized.toLowerCase(),
  );
  return match?.[1] ?? normalized.toUpperCase();
}

export function stateName(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized) return "";
  if (STATE_ABBREVIATIONS[normalized]) return normalized;
  return STATE_NAMES[normalized.toUpperCase()] ?? normalized;
}

export function parseEmailList(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\s,;]+/)
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.includes("@")),
    ),
  );
}

function csvField(value: string | null | undefined): string {
  const text = value ?? "";
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

function normalizeCardNumber(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeYear(value: string): string {
  const trimmed = value.trim();
  return trimmed.length === 2 ? `20${trimmed}` : trimmed;
}

export function detectCardType(number: string): string {
  if (/^3[47]/.test(number)) return "amex";
  if (/^4/.test(number)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(number)) return "mastercard";
  if (/^6/.test(number)) return "discover";
  return "";
}

export function validCard(number: string, month: string, year: string, cvv: string): boolean {
  return (
    /^\d{13,19}$/.test(number) &&
    /^(0[1-9]|1[0-2])$/.test(month) &&
    /^\d{4}$/.test(year) &&
    /^\d{3,4}$/.test(cvv)
  );
}

type ValorAddress = {
  firstName?: string;
  lastName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
};

type ValorProfile = {
  name?: string;
  email?: string;
  phoneNumber?: string;
  billingSameAsShipping?: boolean;
  card?: { holder?: string; number?: string; expiration?: string; cvv?: string; type?: string };
  shipping?: ValorAddress;
  billing?: ValorAddress;
};

function valorAddress(address: ValorAddress | undefined): ProfileAddress {
  return {
    firstName: (address?.firstName ?? "").trim(),
    lastName: (address?.lastName ?? "").trim(),
    line1: (address?.addressLine1 ?? "").trim(),
    line2: (address?.addressLine2 ?? "").trim(),
    city: (address?.city ?? "").trim(),
    state: (address?.state ?? "").trim(),
    zip: (address?.zipCode ?? "").trim(),
  };
}

export function parseValorProfiles(text: string): ConvertibleProfile[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("The uploaded file is not valid JSON.");
  }
  const raw: ValorProfile[] = Array.isArray(data)
    ? (data as ValorProfile[])
    : data && typeof data === "object"
      ? Object.values(data as Record<string, ValorProfile>)
      : [];
  if (raw.length === 0) {
    throw new Error("No profiles found in the uploaded JSON file.");
  }
  return raw
    .filter((profile) => profile && typeof profile === "object")
    .map((profile) => {
      const [rawMonth = "", rawYear = ""] = (profile.card?.expiration ?? "")
        .split("/")
        .map((part) => part.trim());
      const month = rawMonth.padStart(2, "0");
      const year = normalizeYear(rawYear);
      const number = normalizeCardNumber(profile.card?.number);
      const sameBilling = profile.billingSameAsShipping !== false;
      const shipping = valorAddress(profile.shipping);
      return {
        name: (profile.name ?? "").trim(),
        email: (profile.email ?? "").trim(),
        phone: (profile.phoneNumber ?? "").trim(),
        cardHolder: (profile.card?.holder ?? "").trim(),
        cardNumber: number,
        cardMonth: month,
        cardYear: year,
        cardCvv: (profile.card?.cvv ?? "").trim(),
        cardType: (profile.card?.type ?? "").trim() || detectCardType(number),
        sameBilling,
        shipping,
        billing: sameBilling ? shipping : valorAddress(profile.billing),
      };
    });
}

export function parseShikariProfiles(text: string): ConvertibleProfile[] {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim().length > 0));
  if (rows.length < 2) {
    throw new Error("No profile rows found in the uploaded CSV file.");
  }
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const column = (name: string) => header.indexOf(name);
  if (column("email") < 0 || column("cc_number") < 0) {
    throw new Error("The CSV does not look like a Shikari profile export (missing email/cc_number columns).");
  }
  const cell = (row: string[], name: string) => {
    const index = column(name);
    return index >= 0 ? (row[index] ?? "").trim() : "";
  };
  return rows.slice(1).map((row) => {
    const number = normalizeCardNumber(cell(row, "cc_number"));
    const shipping: ProfileAddress = {
      firstName: cell(row, "first_name"),
      lastName: cell(row, "last_name"),
      line1: cell(row, "shipping_street"),
      line2: cell(row, "shipping_street_2"),
      city: cell(row, "shipping_city"),
      state: cell(row, "shipping_state"),
      zip: cell(row, "shipping_zip_code"),
    };
    const billing: ProfileAddress = {
      firstName: cell(row, "billing_first_name"),
      lastName: cell(row, "billing_last_name"),
      line1: cell(row, "billing_street"),
      line2: cell(row, "billing_street_2"),
      city: cell(row, "billing_city"),
      state: cell(row, "billing_state"),
      zip: cell(row, "billing_zip_code"),
    };
    const sameBilling =
      shipping.firstName === billing.firstName &&
      shipping.lastName === billing.lastName &&
      shipping.line1 === billing.line1 &&
      shipping.line2 === billing.line2 &&
      shipping.city === billing.city &&
      stateCode(shipping.state) === stateCode(billing.state) &&
      shipping.zip === billing.zip;
    return {
      name: cell(row, "profile_name"),
      email: cell(row, "email"),
      phone: cell(row, "phone_num"),
      cardHolder: `${billing.firstName} ${billing.lastName}`.trim(),
      cardNumber: number,
      cardMonth: cell(row, "cc_exp_month").padStart(2, "0"),
      cardYear: normalizeYear(cell(row, "cc_exp_year")),
      cardCvv: cell(row, "cc_cvv"),
      cardType: detectCardType(number),
      sameBilling,
      shipping,
      billing: sameBilling ? shipping : billing,
    };
  });
}

export function detectSourceFormat(filename: string, text: string): SourceFormat {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    if (trimmed.startsWith("{") && text.includes('"polarExport"')) {
      throw new Error("PolarAIO files are not supported as input. Upload a Valor JSON or Shikari CSV file.");
    }
    return "valor";
  }
  const firstLine = trimmed.split(/\r?\n/, 1)[0]?.toLowerCase() ?? "";
  if (firstLine.includes("profile_name") || firstLine.includes("cc_number") || filename.toLowerCase().endsWith(".csv")) {
    return "shikari";
  }
  throw new Error("Unrecognized file format. Upload a Valor JSON or Shikari CSV file.");
}

export function parseProfiles(text: string, format: SourceFormat): ConvertibleProfile[] {
  return format === "valor" ? parseValorProfiles(text) : parseShikariProfiles(text);
}

export function filterProfilesByEmails(
  profiles: ConvertibleProfile[],
  emails: string[],
): { matched: ConvertibleProfile[]; unmatchedEmails: string[] } {
  if (emails.length === 0) {
    return { matched: profiles, unmatchedEmails: [] };
  }
  const byEmail = new Map<string, ConvertibleProfile>();
  for (const profile of profiles) {
    const key = profile.email.trim().toLowerCase();
    if (key && !byEmail.has(key)) byEmail.set(key, profile);
  }
  const matched: ConvertibleProfile[] = [];
  const unmatchedEmails: string[] = [];
  for (const email of emails) {
    const profile = byEmail.get(email);
    if (profile) matched.push(profile);
    else unmatchedEmails.push(email);
  }
  return { matched, unmatchedEmails };
}

function formatCardNumberForValor(number: string, cardType: string): string {
  if (cardType === "amex" && number.length === 15) {
    return `${number.slice(0, 4)} ${number.slice(4, 10)} ${number.slice(10)}`;
  }
  return number.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function toShikariCsv(profiles: ConvertibleProfile[], issues: string[]): string {
  const rows: string[] = [SHIKARI_HEADER.join(",")];
  for (const profile of profiles) {
    const month = profile.cardMonth.padStart(2, "0");
    if (!validCard(profile.cardNumber, month, profile.cardYear, profile.cardCvv)) {
      issues.push(`${profile.email || profile.name}: skipped (incomplete or invalid card data)`);
      continue;
    }
    const billing = profile.sameBilling ? profile.shipping : profile.billing;
    rows.push(
      [
        profile.name, profile.shipping.firstName, profile.shipping.lastName, profile.email, profile.phone,
        profile.cardNumber, month, profile.cardYear, profile.cardCvv,
        profile.shipping.line1, profile.shipping.line2, profile.shipping.city,
        stateCode(profile.shipping.state), profile.shipping.zip, "US",
        billing.firstName, billing.lastName, billing.line1, billing.line2, billing.city,
        stateCode(billing.state), billing.zip, "US",
      ].map(csvField).join(","),
    );
  }
  return rows.join("\r\n") + "\r\n";
}

function randomUuid(): string {
  const crypto = globalThis.crypto;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function toValorJson(profiles: ConvertibleProfile[], issues: string[]): string {
  const payload: Record<string, unknown> = {};
  for (const profile of profiles) {
    const month = profile.cardMonth.padStart(2, "0");
    if (!validCard(profile.cardNumber, month, profile.cardYear, profile.cardCvv)) {
      issues.push(`${profile.email || profile.name}: skipped (incomplete or invalid card data)`);
      continue;
    }
    const billing = profile.sameBilling ? profile.shipping : profile.billing;
    const address = (source: ProfileAddress) => ({
      firstName: source.firstName,
      lastName: source.lastName,
      addressLine1: source.line1,
      addressLine2: source.line2,
      city: source.city,
      countryName: "United States",
      countryCode: "US",
      state: stateName(source.state),
      zipCode: source.zip,
    });
    const id = randomUuid();
    payload[id] = {
      name: profile.name,
      email: profile.email,
      phoneNumber: profile.phone,
      billingSameAsShipping: profile.sameBilling,
      oneCheckout: false,
      quickTask: false,
      card: {
        holder: profile.cardHolder || `${billing.firstName} ${billing.lastName}`.trim(),
        number: formatCardNumberForValor(profile.cardNumber, profile.cardType),
        expiration: `${month}/${profile.cardYear.slice(-2)}`,
        cvv: profile.cardCvv,
        type: profile.cardType || detectCardType(profile.cardNumber),
      },
      shipping: address(profile.shipping),
      billing: address(billing),
      id,
      totalSpent: 0,
    };
  }
  return JSON.stringify(payload, null, 2);
}

function toPolarJson(profiles: ConvertibleProfile[], issues: string[]): string {
  const converted = [];
  for (const profile of profiles) {
    const month = profile.cardMonth.padStart(2, "0");
    if (!validCard(profile.cardNumber, month, profile.cardYear, profile.cardCvv)) {
      issues.push(`${profile.email || profile.name}: skipped (incomplete or invalid card data)`);
      continue;
    }
    const billing = profile.sameBilling ? profile.shipping : profile.billing;
    const address = (source: ProfileAddress) => ({
      name: `${source.firstName} ${source.lastName}`.trim(),
      email: profile.email,
      phone: profile.phone,
      line1: source.line1,
      line2: source.line2,
      line3: "",
      postCode: source.zip,
      city: source.city,
      country: "United States",
      state: stateName(source.state),
    });
    converted.push({
      name: profile.name,
      notes: "",
      billingAddress: address(billing),
      shippingAddress: address(profile.shipping),
      paymentDetails: {
        nameOnCard: profile.cardHolder || `${billing.firstName} ${billing.lastName}`.trim(),
        cardType: profile.cardType || detectCardType(profile.cardNumber),
        cardNumber: profile.cardNumber,
        cardExpMonth: month,
        cardExpYear: profile.cardYear,
        cardCvv: profile.cardCvv,
      },
      sameBillingAndShippingAddress: profile.sameBilling,
      onlyCheckoutOnce: false,
      matchNameOnCardAndAddress: false,
    });
  }
  return JSON.stringify(
    {
      polarExport: {
        version: 1,
        kind: "profiles",
        format: "aycd",
        profileGroup: "Converted Profiles",
        exportedAt: new Date().toISOString(),
        profiles: converted,
      },
    },
    null,
    2,
  );
}

export function convertProfiles(profiles: ConvertibleProfile[], format: ConvertFormat): ConvertResult {
  const issues: string[] = [];
  if (format === "shikari") {
    return {
      content: toShikariCsv(profiles, issues),
      filename: "shikari-profiles.csv",
      contentType: "text/csv; charset=utf-8",
      matched: 0,
      issues,
    };
  }
  if (format === "valor") {
    return {
      content: toValorJson(profiles, issues),
      filename: "valor-profiles.json",
      contentType: "application/json; charset=utf-8",
      matched: 0,
      issues,
    };
  }
  return {
    content: toPolarJson(profiles, issues),
    filename: "polar-profiles.json",
    contentType: "application/json; charset=utf-8",
    matched: 0,
    issues,
  };
}
