import { google } from "googleapis";
import { getGoogleSheetsConfig } from "@/lib/payment-info";
import { parseSheetCardMetadata } from "@/lib/sheet-card";

const SHEET_ROW_WIDTH = 30;

function ensureRowWidth(values: string[]): string[] {
  const next = values.slice(0, SHEET_ROW_WIDTH);
  while (next.length < SHEET_ROW_WIDTH) {
    next.push("");
  }
  return next;
}

function matchesAccountId(raw: string, accountId: string): boolean {
  if (!raw) {
    return false;
  }

  return parseSheetCardMetadata(raw).acoAccountId === accountId;
}

function splitAddressLines(value: string | null | undefined) {
  const normalized = (value ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return ["", "", ""];
  }

  const lines = normalized.split("\n").map((line) => line.trim());
  return [lines[0] ?? "", lines[1] ?? "", lines.slice(2).join(" ")];
}

async function getSheetsClient() {
  const { spreadsheetId, sheetName, keyPath } = getGoogleSheetsConfig();
  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  return { sheets, spreadsheetId, sheetName };
}

async function getSheetIdForName(): Promise<number> {
  const { sheets, spreadsheetId, sheetName } = await getSheetsClient();
  const metadata = await sheets.spreadsheets.get({ spreadsheetId });
  const match = (metadata.data.sheets ?? []).find(
    (sheet) => sheet.properties?.title === sheetName,
  );

  if (match?.properties?.sheetId === undefined || match?.properties?.sheetId === null) {
    throw new Error(`Could not resolve sheet id for tab: ${sheetName}`);
  }

  return match.properties.sheetId;
}

async function getMatchingRowNumbers(accountId: string, retailer?: string | null): Promise<number[]> {
  const { sheets, spreadsheetId, sheetName } = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!AC2:AC`,
  });

  const values = response.data.values ?? [];
  const rowNumbers: number[] = [];

  for (let i = 0; i < values.length; i += 1) {
    const raw = String(values[i]?.[0] ?? "").trim();
    const scopeMatches = retailer === undefined ||
      (parseSheetCardMetadata(raw).retailer ?? "").trim().toLowerCase() === (retailer ?? "").trim().toLowerCase();
    if (matchesAccountId(raw, accountId) && scopeMatches) {
      rowNumbers.push(i + 2);
    }
  }

  return rowNumbers;
}

async function getRowValues(rowNumber: number): Promise<string[]> {
  const { sheets, spreadsheetId, sheetName } = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A${rowNumber}:AD${rowNumber}`,
  });

  const values = response.data.values?.[0] ?? [];
  return ensureRowWidth(values.map((value) => String(value ?? "")));
}

export async function upsertGoogleSheetAccountRow(accountId: string, rowValues: string[]) {
  const { sheets, spreadsheetId, sheetName } = await getSheetsClient();
  const normalizedRowValues = ensureRowWidth(rowValues);
  const retailer = parseSheetCardMetadata(normalizedRowValues[28]).retailer ?? null;
  const matchingRows = await getMatchingRowNumbers(accountId, retailer);

  if (matchingRows.length === 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:AD`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [normalizedRowValues],
      },
    });
    return;
  }

  const targetRow = matchingRows[0];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${targetRow}:AD${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [normalizedRowValues],
    },
  });

  if (matchingRows.length > 1) {
    const sheetId = await getSheetIdForName();
    const duplicateRows = matchingRows.slice(1).sort((a, b) => b - a);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: duplicateRows.map((rowNumber) => ({
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        })),
      },
    });
  }
}

export async function deleteGoogleSheetRowsForAccount(accountId: string, retailer?: string | null): Promise<number> {
  const { sheets, spreadsheetId } = await getSheetsClient();
  const sheetId = await getSheetIdForName();
  const matchingRows = await getMatchingRowNumbers(accountId, retailer);

  if (matchingRows.length === 0) {
    return 0;
  }

  const rowsDescending = matchingRows.sort((a, b) => b - a);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: rowsDescending.map((rowNumber) => ({
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: rowNumber - 1,
            endIndex: rowNumber,
          },
        },
      })),
    },
  });

  return matchingRows.length;
}

export async function upsertGoogleSheetAccountRowMerged(
  accountId: string,
  merge: (currentRow: string | string[] | null) => string[],
) {
  const { sheets, spreadsheetId, sheetName } = await getSheetsClient();
  const matchingRows = await getMatchingRowNumbers(accountId);

  if (matchingRows.length === 0) {
    const nextRow = ensureRowWidth(merge(null));
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:AD`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [nextRow],
      },
    });
    return;
  }

  for (const targetRow of matchingRows) {
    const currentRow = await getRowValues(targetRow);
    const nextRow = ensureRowWidth(merge(currentRow));
    nextRow[28] = currentRow[28];
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A${targetRow}:AD${targetRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [nextRow],
      },
    });
  }
}

export type CardVaultEntry = {
  cardholderName: string;
  cardBrand: string;
  cardNumber: string;
  expMonth: number;
  expYear: number;
  cvv: string;
};

const CARD_VAULT_HEADERS = ["Card ID", "Name on Card", "Card Type", "Card Number", "Expiration Month", "Expiration Year", "CVV"];

function cardVaultTabName(): string {
  return process.env.GOOGLE_SHEETS_CARD_VAULT_TAB_NAME?.trim() || "ChudACO Card Vault";
}

function cardVaultRange(range: string): string {
  return `'${cardVaultTabName().replace(/'/g, "''")}'!${range}`;
}

// Library cards live in their own tab so bots importing the main tab never see unlinked cards.
async function ensureCardVaultTab() {
  const { sheets, spreadsheetId } = await getSheetsClient();
  const tab = cardVaultTabName();
  const metadata = await sheets.spreadsheets.get({ spreadsheetId });
  if ((metadata.data.sheets ?? []).some((sheet) => sheet.properties?.title === tab)) {
    return { sheets, spreadsheetId };
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: cardVaultRange("A1:G1"),
    valueInputOption: "RAW",
    requestBody: { values: [CARD_VAULT_HEADERS] },
  });
  return { sheets, spreadsheetId };
}

async function findCardVaultRowNumber(cardId: string): Promise<number | null> {
  const { sheets, spreadsheetId } = await ensureCardVaultTab();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: cardVaultRange("A2:A") });
  const index = (response.data.values ?? []).findIndex((row) => String(row?.[0] ?? "").trim() === cardId);
  return index === -1 ? null : index + 2;
}

export async function upsertCardVaultRow(cardId: string, entry: CardVaultEntry) {
  const { sheets, spreadsheetId } = await ensureCardVaultTab();
  const values = [vaultRowValues(cardId, entry)];
  const rowNumber = await findCardVaultRowNumber(cardId);

  if (rowNumber === null) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: cardVaultRange("A:G"),
      valueInputOption: "RAW",
      requestBody: { values },
    });
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: cardVaultRange(`A${rowNumber}:G${rowNumber}`),
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

export async function getCardVaultRow(cardId: string): Promise<CardVaultEntry | null> {
  const rowNumber = await findCardVaultRowNumber(cardId);
  if (rowNumber === null) return null;

  const { sheets, spreadsheetId } = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: cardVaultRange(`A${rowNumber}:G${rowNumber}`),
  });
  const row = (response.data.values?.[0] ?? []).map((value) => String(value ?? ""));
  return parseVaultRow(row);
}

function vaultRowValues(cardId: string, entry: CardVaultEntry): string[] {
  return [
    cardId,
    entry.cardholderName,
    entry.cardBrand,
    entry.cardNumber,
    String(entry.expMonth),
    String(entry.expYear),
    entry.cvv,
  ];
}

function parseVaultRow(row: string[]): CardVaultEntry | null {
  if (!row[3] || !row[6]) return null;
  return {
    cardholderName: row[1] ?? "",
    cardBrand: row[2] ?? "",
    cardNumber: row[3],
    expMonth: Number(row[4]),
    expYear: Number(row[5]),
    cvv: row[6],
  };
}

export async function getAllCardVaultRows(): Promise<Map<string, CardVaultEntry>> {
  const { sheets, spreadsheetId } = await ensureCardVaultTab();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: cardVaultRange("A2:G") });
  const entries = new Map<string, CardVaultEntry>();
  for (const raw of response.data.values ?? []) {
    const row = raw.map((value) => String(value ?? ""));
    const entry = parseVaultRow(row);
    if (row[0] && entry) entries.set(row[0].trim(), entry);
  }
  return entries;
}

export async function appendCardVaultRows(rows: Array<{ cardId: string; entry: CardVaultEntry }>) {
  if (rows.length === 0) return;
  const { sheets, spreadsheetId } = await ensureCardVaultTab();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: cardVaultRange("A:G"),
    valueInputOption: "RAW",
    requestBody: { values: rows.map(({ cardId, entry }) => vaultRowValues(cardId, entry)) },
  });
}

export async function getMainSheetRows(): Promise<string[][]> {
  const { sheets, spreadsheetId, sheetName } = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:AD` });
  return (response.data.values ?? []).map((row) => row.map((value) => String(value ?? "")));
}

export async function deleteCardVaultRow(cardId: string) {
  const rowNumber = await findCardVaultRowNumber(cardId);
  if (rowNumber === null) return;

  const { sheets, spreadsheetId } = await getSheetsClient();
  const tab = cardVaultTabName();
  const metadata = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetId = (metadata.data.sheets ?? []).find((sheet) => sheet.properties?.title === tab)?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber },
        },
      }],
    },
  });
}

type ShippingSyncInput = {
  accountId: string;
  botProfileName: string;
  email: string | null;
  loginEmail: string | null;
  onlyOneCheckout: boolean;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddr: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingZip: string | null;
  billingSameAsShipping: boolean;
  billingName: string | null;
  billingPhone: string | null;
  billingAddr: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingZip: string | null;
};

export async function upsertGoogleSheetShippingFields(input: ShippingSyncInput) {
  await upsertGoogleSheetAccountRowMerged(input.accountId, (currentRow) => {
    const baseRow = ensureRowWidth(Array.isArray(currentRow) ? currentRow : []);
    const billingName = input.billingSameAsShipping
      ? input.shippingName ?? ""
      : input.billingName ?? "";
    const billingPhone = input.billingSameAsShipping
      ? input.shippingPhone ?? ""
      : input.billingPhone ?? "";
    const shippingAddrParts = splitAddressLines(input.shippingAddr);
    const billingAddrParts = splitAddressLines(input.billingSameAsShipping ? input.shippingAddr : input.billingAddr);
    const billingCity = input.billingSameAsShipping
      ? input.shippingCity ?? ""
      : input.billingCity ?? "";
    const billingState = input.billingSameAsShipping
      ? input.shippingState ?? ""
      : input.billingState ?? "";
    const billingZip = input.billingSameAsShipping
      ? input.shippingZip ?? ""
      : input.billingZip ?? "";

    baseRow[0] = input.email ?? "";
    baseRow[1] = input.botProfileName;
    baseRow[2] = input.onlyOneCheckout ? "TRUE" : "FALSE";
    baseRow[9] = input.billingSameAsShipping ? "TRUE" : "FALSE";
    baseRow[10] = input.shippingName ?? "";
    baseRow[11] = input.shippingPhone ?? "";
    baseRow[12] = shippingAddrParts[0];
    baseRow[13] = shippingAddrParts[1];
    baseRow[14] = shippingAddrParts[2];
    baseRow[15] = input.shippingZip ?? "";
    baseRow[16] = input.shippingCity ?? "";
    baseRow[17] = input.shippingState ?? "";
    baseRow[18] = "US";
    baseRow[19] = billingName;
    baseRow[20] = billingPhone;
    baseRow[21] = billingAddrParts[0];
    baseRow[22] = billingAddrParts[1];
    baseRow[23] = billingAddrParts[2];
    baseRow[24] = billingZip;
    baseRow[25] = billingCity;
    baseRow[26] = billingState;
    baseRow[27] = "US";
    baseRow[28] = JSON.stringify({ acoAccountId: input.accountId });

    return baseRow;
  });
}
