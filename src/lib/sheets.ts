import { cache } from "react";
import { google } from "googleapis";

import { inferBrand, type ConcreteBrand } from "@/lib/brands";

type RawSheet = {
  id: number;
  title: string;
  headers: string[];
  rows: Record<string, string>[];
};

export type LeadTableColumn = {
  key: string;
  label: string;
};

type DataSheetConfig = {
  brandByTab: Map<string, ConcreteBrand>;
  leadTableColumns: LeadTableColumn[];
};

export type DashboardRow = {
  id: string;
  tabName: string;
  date: string | null;
  brand: ConcreteBrand | "unknown";
  campaign: string;
  adName: string;
  formName: string;
  platform: string;
  location: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  leadStatus: string;
  isOrganic: boolean;
  leadCount: number;
  raw: Record<string, string>;
};

export type WorkbookData = {
  sheetId: string;
  defaultTabName: string;
  tabs: string[];
  rows: DashboardRow[];
  leadTableColumns: LeadTableColumn[];
  error?: string;
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function expandAliases(value: string) {
  return value
    .replace(/\bBW\b/gi, "Bigwing")
    .replace(/\bRW\b/gi, "Redwing")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLookupKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizeLocation(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\-/]+/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function parseDateValue(value: string | undefined) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().slice(0, 10);
  }

  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return null;

  const [, first, second, third] = match;
  const year = third.length === 2 ? `20${third}` : third;
  const month = Number(first);
  const day = Number(second);
  const fallback = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);

  if (Number.isNaN(fallback.getTime())) {
    return null;
  }

  return fallback.toISOString().slice(0, 10);
}

function getFirstValue(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== "") {
      return value;
    }
  }

  return "";
}

function normalizeBrandValue(value: string): ConcreteBrand | null {
  const normalized = value.trim().toLowerCase();

  if (!normalized) return null;
  if (normalized.includes("bigwing") || normalized === "big") return "bigwing";
  if (normalized.includes("redwing") || normalized === "red") return "redwing";

  return null;
}

function formatColumnLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractDataSheetConfig(rawSheets: RawSheet[]): DataSheetConfig {
  const dataSheet = rawSheets.find((sheet) => sheet.title.trim().toUpperCase() === "DATA");
  const brandByTab = new Map<string, ConcreteBrand>();
  const leadTableColumns: LeadTableColumn[] = [];
  const seenColumns = new Set<string>();

  if (!dataSheet) {
    return { brandByTab, leadTableColumns };
  }

  for (const row of dataSheet.rows) {
    const tabName = getFirstValue(row, ["tab", "tab_name", "sheet", "sheet_name", "campaign_tab"]);
    const brand = normalizeBrandValue(
      getFirstValue(row, ["brand", "brand_name", "brand_alias", "wing", "company"]),
    );
    const tableColumnKey = normalizeHeader(
      getFirstValue(row, ["table_column", "column", "field", "column_key"]),
    );
    const tableColumnLabel =
      getFirstValue(row, ["table_label", "label", "display_name", "column_label"]) ||
      formatColumnLabel(tableColumnKey);

    if (tabName && brand) {
      brandByTab.set(normalizeLookupKey(expandAliases(tabName)), brand);
    }

    if (tableColumnKey && !seenColumns.has(tableColumnKey)) {
      leadTableColumns.push({ key: tableColumnKey, label: tableColumnLabel });
      seenColumns.add(tableColumnKey);
    }
  }

  return { brandByTab, leadTableColumns };
}

function normalizeRow(
  tabName: string,
  row: Record<string, string>,
  index: number,
  dataSheetConfig: DataSheetConfig,
): DashboardRow {
  const campaign = expandAliases(
    getFirstValue(row, ["campaign", "campaign_name", "campaignname"]) || tabName,
  );
  const adName = expandAliases(getFirstValue(row, ["ad_name", "adname", "ad", "creative_name"]));
  const formName = expandAliases(getFirstValue(row, ["form_name", "formname"]));
  const platform = getFirstValue(row, ["platform"]).toLowerCase();
  const location = normalizeLocation(getFirstValue(row, [
    "are_you_located_in_whitefield_hoodi",
    "are_you_located_in_whitefield_or_hoodi",
    "are_you_located_in_whitefield_/_hoodi",
    "are_you_located_in_whitefield_/_hoodi_",
    "select_your_nearest_branch",
    "select_your_area",
    "location",
  ]));
  const fullName = getFirstValue(row, ["full_name", "name"]);
  const phoneNumber = getFirstValue(row, ["phone_number", "phone", "mobile_number"]);
  const email = getFirstValue(row, ["email", "email_address"]);
  const leadStatus = getFirstValue(row, ["lead_status", "status"]) || "UNKNOWN";
  const date = parseDateValue(
    getFirstValue(row, ["date", "day", "reporting_starts", "start_date", "created_time"]),
  );
  const brandAlias = expandAliases(getFirstValue(row, ["brand", "brand_alias", "account_name", "account"]));
  const expandedTabName = expandAliases(tabName);
  const mappedBrand = dataSheetConfig.brandByTab.get(normalizeLookupKey(expandedTabName));
  const brand = mappedBrand ?? inferBrand(campaign, adName, brandAlias, expandedTabName);

  return {
    id: `${tabName}-${index}`,
    tabName: expandedTabName,
    date,
    brand: brand ?? "unknown",
    campaign,
    adName,
    formName,
    platform,
    location,
    fullName,
    phoneNumber,
    email,
    leadStatus,
    isOrganic: getFirstValue(row, ["is_organic"]).toLowerCase() === "true",
    leadCount: 1,
    raw: row,
  };
}

async function getSheetsClient() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !privateKey) {
    throw new Error("Missing Google service account credentials.");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth });
}

async function fetchRawSheets(): Promise<RawSheet[]> {
  const spreadsheetId = process.env.SHEET_ID;

  if (!spreadsheetId) {
    throw new Error("Missing SHEET_ID.");
  }

  const sheets = await getSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });

  const ranges =
    spreadsheet.data.sheets
      ?.map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title))
      .map((title) => `'${title.replace(/'/g, "''")}'`)
      .map((title) => `${title}!A:ZZ`) ?? [];

  if (ranges.length === 0) {
    return [];
  }

  const values = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
    majorDimension: "ROWS",
  });

  return (
    values.data.valueRanges?.map((sheetValues, index) => {
      const title = spreadsheet.data.sheets?.[index]?.properties?.title ?? `Sheet ${index + 1}`;
      const id = spreadsheet.data.sheets?.[index]?.properties?.sheetId ?? index;
      const rows = sheetValues.values ?? [];
      const headerRow = rows[0] ?? [];
      const headers = headerRow.map((header) => normalizeHeader(String(header)));
      const dataRows = rows.slice(1).map((cells) => {
        const record: Record<string, string> = {};

        headers.forEach((header, cellIndex) => {
          if (!header) return;
          record[header] = String(cells[cellIndex] ?? "").trim();
        });

        return record;
      });

      return {
        id,
        title,
        headers,
        rows: dataRows,
      };
    }) ?? []
  );
}

export const getWorkbookData = cache(async (): Promise<WorkbookData> => {
  const spreadsheetId = process.env.SHEET_ID ?? "";
  const defaultTabName = process.env.TAB_NAME ?? "DATA";

  try {
    const rawSheets = await fetchRawSheets();
    const dataSheetConfig = extractDataSheetConfig(rawSheets);
    const usableSheets = rawSheets.filter((sheet) => sheet.title.trim().toUpperCase() !== "DATA");
    const tabs = usableSheets.map((sheet) => expandAliases(sheet.title));
    const rows = usableSheets.flatMap((sheet) =>
      sheet.rows
        .filter((row) => Object.values(row).some(Boolean))
        .map((row, index) => normalizeRow(sheet.title, row, index, dataSheetConfig)),
    );

    return {
      sheetId: spreadsheetId,
      defaultTabName,
      tabs,
      rows,
      leadTableColumns: dataSheetConfig.leadTableColumns,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read spreadsheet data right now.";

    return {
      sheetId: spreadsheetId,
      defaultTabName,
      tabs: [],
      rows: [],
      leadTableColumns: [],
      error: message,
    };
  }
});
