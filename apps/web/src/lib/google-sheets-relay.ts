import { google } from "googleapis";
import { getGoogleSheetsConfig } from "@/lib/payment-info";

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

  if (raw === accountId || raw.includes(accountId)) {
    return true;
  }

  try {
    const parsed = JSON.parse(raw) as { acoAccountId?: string };
    return parsed.acoAccountId === accountId;
  } catch {
    return false;
  }
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

async function getMatchingRowNumbers(accountId: string): Promise<number[]> {
  const { sheets, spreadsheetId, sheetName } = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!AC2:AC`,
  });

  const values = response.data.values ?? [];
  const rowNumbers: number[] = [];

  for (let i = 0; i < values.length; i += 1) {
    const raw = String(values[i]?.[0] ?? "").trim();
    if (matchesAccountId(raw, accountId)) {
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
  const matchingRows = await getMatchingRowNumbers(accountId);

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

export async function deleteGoogleSheetRowsForAccount(accountId: string): Promise<number> {
  const { sheets, spreadsheetId } = await getSheetsClient();
  const sheetId = await getSheetIdForName();
  const matchingRows = await getMatchingRowNumbers(accountId);

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

  const targetRow = matchingRows[0];
  const currentRow = await getRowValues(targetRow);
  const nextRow = ensureRowWidth(merge(currentRow));

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${targetRow}:AD${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [nextRow],
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

type ShippingSyncInput = {
  accountId: string;
  label: string;
  email: string;
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
    const billingAddr = input.billingSameAsShipping
      ? input.shippingAddr ?? ""
      : input.billingAddr ?? "";
    const billingCity = input.billingSameAsShipping
      ? input.shippingCity ?? ""
      : input.billingCity ?? "";
    const billingState = input.billingSameAsShipping
      ? input.shippingState ?? ""
      : input.billingState ?? "";
    const billingZip = input.billingSameAsShipping
      ? input.shippingZip ?? ""
      : input.billingZip ?? "";

    baseRow[0] = input.loginEmail ?? input.email;
    baseRow[1] = input.label;
    baseRow[2] = input.onlyOneCheckout ? "TRUE" : "FALSE";
    baseRow[9] = input.billingSameAsShipping ? "TRUE" : "FALSE";
    baseRow[10] = input.shippingName ?? "";
    baseRow[11] = input.shippingPhone ?? "";
    baseRow[12] = input.shippingAddr ?? "";
    baseRow[15] = input.shippingZip ?? "";
    baseRow[16] = input.shippingCity ?? "";
    baseRow[17] = input.shippingState ?? "";
    baseRow[18] = "US";
    baseRow[19] = billingName;
    baseRow[20] = billingPhone;
    baseRow[21] = billingAddr;
    baseRow[24] = billingZip;
    baseRow[25] = billingCity;
    baseRow[26] = billingState;
    baseRow[27] = "US";
    baseRow[28] = JSON.stringify({ acoAccountId: input.accountId });

    return baseRow;
  });
}
