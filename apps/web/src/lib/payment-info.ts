import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

export function normalizeExpirationYear(value: number): number {
  if (value < 100) {
    return 2000 + value;
  }

  return value;
}

export const paymentInfoSchema = z
  .object({
    cardNumber: z
      .string()
      .trim()
      .min(12)
      .max(19)
      .regex(/^[0-9\s-]+$/, "Card number must contain only digits, spaces, or dashes"),
    expMonth: z.coerce.number().int().min(1).max(12),
    expYear: z.coerce.number().int().min(0).max(9999),
    cvv: z.string().trim().regex(/^\d{3,4}$/, "CVV must be 3 or 4 digits"),
    cardholderName: z.string().trim().min(1).max(120),
    cardBrand: z.string().trim().min(1).max(50),
  })
  .superRefine((value, ctx) => {
    const normalizedYear = normalizeExpirationYear(value.expYear);
    const isPastYear = normalizedYear < currentYear;
    const isPastMonth = normalizedYear === currentYear && value.expMonth < currentMonth;
    const tooFarInFuture = normalizedYear > currentYear + 25;

    if (tooFarInFuture) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expYear"],
        message: "Card expiry year is too far in the future",
      });
    }

    if (isPastYear || isPastMonth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expMonth"],
        message: "Card expiry date is in the past",
      });
    }
  });

export function normalizeCardNumber(value: string): string {
  return value.replace(/[\s-]/g, "");
}

export function getCardLast4(cardNumber: string): string {
  const normalized = normalizeCardNumber(cardNumber);
  return normalized.slice(-4);
}

export const GOOGLE_SHEET_COLUMNS = [
  "Email Address",
  "Profile Name",
  "Only One Checkout",
  "Name on Card",
  "Card Type",
  "Card Number",
  "Expiration Month",
  "Expiration Year",
  "CVV",
  "Same Billing/Shipping",
  "Shipping Name",
  "Shipping Phone",
  "Shipping Address",
  "Shipping Address 2",
  "Shipping Address 3",
  "Shipping Post Code",
  "Shipping City",
  "Shipping State",
  "Shipping Country",
  "Billing Name",
  "Billing Phone",
  "Billing Address",
  "Billing Address 2",
  "Billing Address 3",
  "Billing Post Code",
  "Billing City",
  "Billing State",
  "Billing Country",
  "otherEntriesList",
  "Size (Optional)",
] as const;

export type GoogleSheetsConfig = {
  spreadsheetId: string;
  sheetName: string;
  keyPath: string;
};

export function getGoogleSheetsConfig(): GoogleSheetsConfig {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID?.trim();
  const sheetName = process.env.GOOGLE_SHEETS_TAB_NAME?.trim() || "Sheet 1";
  const configuredKeyPath =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH?.trim() ||
    "../../studious-loader-506306-k2-d641df9f3ab4.json";

  if (!spreadsheetId) {
    throw new Error("Missing GOOGLE_SHEETS_ID");
  }

  const candidates = [
    configuredKeyPath,
    path.resolve(process.cwd(), configuredKeyPath),
    path.resolve(process.cwd(), "studious-loader-506306-k2-d641df9f3ab4.json"),
  ];

  const keyPath = candidates.find((candidate) => fs.existsSync(candidate));

  if (!keyPath) {
    throw new Error(
      `Could not find Google service account key file. Checked: ${candidates.join(", ")}`,
    );
  }

  return {
    spreadsheetId,
    sheetName,
    keyPath,
  };
}

type GoogleSheetRowInput = {
  emailAddress: string;
  profileName: string;
  nameOnCard: string;
  cardType: string;
  cardNumber: string;
  expirationMonth: number;
  expirationYear: number;
  cvv: string;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  shippingPostCode: string;
  shippingCity: string;
  shippingState: string;
  shippingCountry: string;
  billingName: string;
  billingPhone: string;
  billingAddress: string;
  billingPostCode: string;
  billingCity: string;
  billingState: string;
  billingCountry: string;
  otherEntriesList: string;
  sizeOptional: string;
};

export function buildGoogleSheetRow(values: GoogleSheetRowInput): string[] {
  return [
    values.emailAddress,
    values.profileName,
    "TRUE",
    values.nameOnCard,
    values.cardType,
    values.cardNumber,
    String(values.expirationMonth),
    String(values.expirationYear),
    values.cvv,
    "TRUE",
    values.shippingName,
    values.shippingPhone,
    values.shippingAddress,
    "",
    "",
    values.shippingPostCode,
    values.shippingCity,
    values.shippingState,
    values.shippingCountry,
    values.billingName,
    values.billingPhone,
    values.billingAddress,
    "",
    "",
    values.billingPostCode,
    values.billingCity,
    values.billingState,
    values.billingCountry,
    values.otherEntriesList,
    values.sizeOptional,
  ];
}