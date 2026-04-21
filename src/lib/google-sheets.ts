import { google } from "googleapis";

export type ApprovalSheetRow = {
  allow: string;
  createdTime: string;
  id: string;
  name: string;
  rowNumber: number;
  sentStatus: string;
  session: string;
};

type SheetsClientScopes = string[];

const APPROVAL_HEADERS = [
  "session",
  "allow",
  "name",
  "created_time",
  "id",
  "sent",
] as const;

function getGoogleSheetId() {
  const sheetId =
    process.env.GOOGLE_SHEET_ID?.trim() || process.env.SHEET_ID?.trim();

  if (!sheetId) {
    throw new Error("Missing GOOGLE_SHEET_ID.");
  }

  return sheetId;
}

function getGoogleSheetName() {
  const sheetName = process.env.GOOGLE_SHEET_NAME?.trim() || "DATA";

  if (!sheetName) {
    throw new Error("Missing GOOGLE_SHEET_NAME.");
  }

  return sheetName;
}

function parseGoogleServiceKey() {
  const rawServiceKey = process.env.GOOGLE_SERVICE_KEY?.trim();

  if (rawServiceKey) {
    try {
      const parsed = JSON.parse(rawServiceKey) as {
        client_email?: string;
        private_key?: string;
      };

      if (parsed.client_email && parsed.private_key) {
        return {
          client_email: parsed.client_email,
          private_key: parsed.private_key.replace(/\\n/g, "\n"),
        };
      }
    } catch {
      // Fall back to the split env vars below.
    }
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing GOOGLE_SERVICE_KEY or GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY.",
    );
  }

  return {
    client_email: clientEmail,
    private_key: privateKey,
  };
}

async function getSheetsClient(
  scopes: SheetsClientScopes = ["https://www.googleapis.com/auth/spreadsheets"],
) {
  const credentials = parseGoogleServiceKey();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes,
  });

  return google.sheets({ version: "v4", auth });
}

function getApprovalHeaderRange() {
  return `${getGoogleSheetName()}!X1:AC1`;
}

function getApprovalDataRange() {
  return `${getGoogleSheetName()}!X2:AC`;
}

function normalizeCellValue(value: unknown) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function normalizeApprovalValue(value: string) {
  const normalized = value.trim().toLowerCase();

  if (normalized === "true") return "TRUE";
  if (normalized === "false") return "FALSE";
  return "PENDING";
}

export function getApprovalState(value: string) {
  const normalized = normalizeApprovalValue(value);

  if (normalized === "TRUE") return "approved";
  if (normalized === "FALSE") return "blocked";
  return "pending";
}

export async function ensureApprovalSheetHeaders() {
  const sheets = await getSheetsClient();
  const spreadsheetId = getGoogleSheetId();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: getApprovalHeaderRange(),
  });
  const existingHeaders = (response.data.values?.[0] ?? []).map((value) =>
    normalizeCellValue(value),
  );
  const headersMatch =
    existingHeaders.length === APPROVAL_HEADERS.length &&
    existingHeaders.every((header, index) => header === APPROVAL_HEADERS[index]);

  if (headersMatch) {
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: getApprovalHeaderRange(),
    valueInputOption: "RAW",
    requestBody: {
      values: [Array.from(APPROVAL_HEADERS)],
    },
  });
}

export async function readApprovalRows(): Promise<ApprovalSheetRow[]> {
  await ensureApprovalSheetHeaders();

  const sheets = await getSheetsClient([
    "https://www.googleapis.com/auth/spreadsheets.readonly",
  ]);
  const spreadsheetId = getGoogleSheetId();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: getApprovalDataRange(),
    majorDimension: "ROWS",
  });
  const rows = response.data.values ?? [];

  return rows.map((row, index) => ({
    allow: normalizeCellValue(row[1]),
    createdTime: normalizeCellValue(row[3]),
    id: normalizeCellValue(row[4]),
    name: normalizeCellValue(row[2]),
    rowNumber: index + 2,
    sentStatus: normalizeCellValue(row[5]),
    session: normalizeCellValue(row[0]),
  }));
}

export async function findRowByUserId(userId: string) {
  const normalizedUserId = normalizeCellValue(userId);
  if (!normalizedUserId) {
    return null;
  }

  const rows = await readApprovalRows();
  return rows.find((row) => row.id === normalizedUserId) ?? null;
}

export async function updateAllowColumn(rowNumber: number, allow: "TRUE" | "FALSE") {
  const sheets = await getSheetsClient();
  const spreadsheetId = getGoogleSheetId();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${getGoogleSheetName()}!Y${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[allow]],
    },
  });
}

export async function updateSentStatus(rowNumber: number, status: "SENT" | "") {
  const sheets = await getSheetsClient();
  const spreadsheetId = getGoogleSheetId();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${getGoogleSheetName()}!AC${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[status]],
    },
  });
}
