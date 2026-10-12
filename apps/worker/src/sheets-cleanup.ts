import { google, type sheets_v4 } from "googleapis";

type SheetsClient = {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} for departed-member cleanup`);
  return value;
}

function quoteTab(tabName: string, range: string): string {
  return `'${tabName.replace(/'/g, "''")}'!${range}`;
}

async function getSheetsClient(): Promise<SheetsClient> {
  const auth = new google.auth.GoogleAuth({
    keyFile: requiredEnv("GOOGLE_SERVICE_ACCOUNT_KEY_PATH"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return {
    sheets: google.sheets({ version: "v4", auth }),
    spreadsheetId: requiredEnv("GOOGLE_SHEETS_ID"),
  };
}

export function parseSheetAccountId(raw: string): string | null {
  if (!raw) return null;
  try {
    const metadata = JSON.parse(raw) as { acoAccountId?: unknown };
    return typeof metadata.acoAccountId === "string" ? metadata.acoAccountId : null;
  } catch {
    return raw;
  }
}

export async function deleteMemberSheetData(accountIds: string[], cardIds: string[]): Promise<void> {
  if (accountIds.length === 0 && cardIds.length === 0) return;

  const { sheets, spreadsheetId } = await getSheetsClient();
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const tabProperties = (metadata.data.sheets ?? [])
    .map((sheet) => sheet.properties)
    .filter((properties): properties is sheets_v4.Schema$SheetProperties => Boolean(properties?.title));
  const mainTabName = process.env.GOOGLE_SHEETS_TAB_NAME?.trim() || "Sheet 1";
  const mainTab = tabProperties.find((properties) => properties.title === mainTabName);
  if (mainTab?.sheetId === undefined || mainTab.sheetId === null) {
    throw new Error(`Could not resolve Google Sheets tab: ${mainTabName}`);
  }

  const requestsBySheet = new Map<number, number[]>();
  const addRows = (sheetId: number, rowNumbers: number[]) => {
    const existing = requestsBySheet.get(sheetId) ?? [];
    requestsBySheet.set(sheetId, existing.concat(rowNumbers));
  };

  if (accountIds.length > 0) {
    const rows = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: quoteTab(mainTabName, "AC2:AC"),
    });
    const accountIdSet = new Set(accountIds);
    const accountRows = (rows.data.values ?? []).flatMap((row, index) => {
      const rowAccount = parseSheetAccountId(String(row?.[0] ?? "").trim());
      return rowAccount && accountIdSet.has(rowAccount) ? [index + 2] : [];
    });
    addRows(mainTab.sheetId, accountRows);
  }

  const cardVaultTabName = process.env.GOOGLE_SHEETS_CARD_VAULT_TAB_NAME?.trim() || "ChudACO Card Vault";
  const cardVaultTab = tabProperties.find((properties) => properties.title === cardVaultTabName);
  if (cardIds.length > 0 && cardVaultTab?.sheetId !== undefined && cardVaultTab.sheetId !== null) {
    const rows = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: quoteTab(cardVaultTabName, "A2:A"),
    });
    const cardIdSet = new Set(cardIds);
    const cardRows = (rows.data.values ?? []).flatMap((row, index) => {
      const cardId = String(row?.[0] ?? "").trim();
      return cardId && cardIdSet.has(cardId) ? [index + 2] : [];
    });
    addRows(cardVaultTab.sheetId, cardRows);
  }

  const requests: sheets_v4.Schema$Request[] = [];
  for (const [sheetId, rowNumbers] of requestsBySheet) {
    for (const rowNumber of Array.from(new Set(rowNumbers)).sort((a, b) => b - a)) {
      requests.push({
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: rowNumber - 1,
            endIndex: rowNumber,
          },
        },
      });
    }
  }

  for (let start = 0; start < requests.length; start += 500) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: requests.slice(start, start + 500) },
    });
  }
}