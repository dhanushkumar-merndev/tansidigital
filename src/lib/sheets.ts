import { cache } from "react";

import { type ConcreteBrand } from "@/lib/brands";

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
  digitalLeads: DigitalLeadImportEntry[];
  leadTableColumns: LeadTableColumn[];
  error?: string;
};

export type DigitalLeadImportEntry = {
  date: string;
  actual: number;
  contacted: number;
  nonContacted: number;
  interested: number;
};

export type DigitalLeadImportMeta = {
  lastImportedDate: string | null;
  prompt: string;
};

const DATA_SHEET_TITLE = "DATA";
const DIGITAL_REPORT_TYPE = "redwing_digital_leads";
const DIGITAL_DATA_HEADERS = [
  "Report Type",
  "Report Brand",
  "Report Date",
  "Actual",
  "Contacted",
  "Non Contacted",
  "Interested",
  "Prompt Used",
  "Imported At",
] as const;

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

function formatDateInIst(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseDateValue(value: string | undefined) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) {
    return formatDateInIst(direct);
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

  return formatDateInIst(fallback);
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

function splitMappingValues(value: string) {
  return value
    .split(/[,\n|]+/)
    .map((item) => expandAliases(item).trim())
    .filter(Boolean);
}

function addBrandMappingEntry(
  brandByTab: Map<string, ConcreteBrand>,
  brand: ConcreteBrand,
  value: string,
) {
  const normalizedValue = normalizeLookupKey(expandAliases(value));
  if (!normalizedValue) return;

  brandByTab.set(normalizedValue, brand);
}

function formatColumnLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractDataSheetConfig(rawSheets: RawSheet[]): DataSheetConfig {
  const dataSheet = rawSheets.find((sheet) => sheet.title.trim().toUpperCase() === DATA_SHEET_TITLE);
  const brandByTab = new Map<string, ConcreteBrand>();
  const leadTableColumns: LeadTableColumn[] = [];
  const seenColumns = new Set<string>();

  if (!dataSheet) {
    return { brandByTab, leadTableColumns };
  }

  for (const row of dataSheet.rows) {
    const tabName = getFirstValue(row, ["tab", "tab_name", "sheet", "sheet_name", "campaign_tab"]);
    const tabAliases = getFirstValue(row, [
      "tab_aliases",
      "aliases",
      "alias",
      "tab_mapping",
      "tab_match",
      "mapping",
      "match_values",
    ]);
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
      addBrandMappingEntry(brandByTab, brand, tabName);

      for (const alias of splitMappingValues(tabAliases)) {
        addBrandMappingEntry(brandByTab, brand, alias);
      }
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
  const brand = mappedBrand ?? normalizeBrandValue(brandAlias);

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

async function getSheetsClient(
  scopes: string[] = ["https://www.googleapis.com/auth/spreadsheets.readonly"],
) {
  try {
    // Using require instead of dynamic import is more stable for large CJS libraries in Next.js
    const { google } = await import("googleapis");
    
    const email = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!email || !privateKey) {
      throw new Error("Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY in .env");
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: email,
        private_key: privateKey,
      },
      scopes,
    });

    return google.sheets({ version: "v4", auth });
  } catch (error) {
    console.error("Failed to initialize Google Sheets client:", error);
    throw error;
  }
}

interface GSheetsResponse {
  data: {
    valueRanges?: Array<{
      values?: string[][];
    }>;
  };
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
      .map((title: string) => `'${title.replace(/'/g, "''")}'`)
      .map((title: string) => `${title}!A:ZZ`) ?? [];

  if (ranges.length === 0) {
    return [];
  }

  const values = await Promise.race([
    sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
      majorDimension: "ROWS",
    }),
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Google Sheets request timed out (15s limit). Your data might be too large.")), 15000)
    )
  ]) as unknown as GSheetsResponse;

  return (
    values.data.valueRanges?.map((sheetValues: { values?: string[][] }, index: number) => {
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

/** In-memory TTL cache shared across all requests (30 seconds) */
const CACHE_TTL_MS = 30_000;
let _cachedData: WorkbookData | null = null;
let _cacheTimestamp = 0;
let _inflightPromise: Promise<WorkbookData> | null = null;

async function fetchWorkbookDataInternal(): Promise<WorkbookData> {
  const spreadsheetId = process.env.SHEET_ID ?? "";
  const defaultTabName = process.env.TAB_NAME ?? "DATA";

  try {
    const rawSheets = await fetchRawSheets();
    const dataSheet = rawSheets.find((sheet) => sheet.title.trim().toUpperCase() === DATA_SHEET_TITLE);
    const digitalLeads: DigitalLeadImportEntry[] = [];

    if (dataSheet) {
      const typeIdx = dataSheet.headers.indexOf(normalizeHeader("Report Type"));
      const brandIdx = dataSheet.headers.indexOf(normalizeHeader("Report Brand"));
      const dateIdx = dataSheet.headers.indexOf(normalizeHeader("Report Date"));
      const actualIdx = dataSheet.headers.indexOf(normalizeHeader("Actual"));
      const contactedIdx = dataSheet.headers.indexOf(normalizeHeader("Contacted"));
      const nonContactedIdx = dataSheet.headers.indexOf(normalizeHeader("Non Contacted"));
      const interestedIdx = dataSheet.headers.indexOf(normalizeHeader("Interested"));

      if (typeIdx !== -1 && brandIdx !== -1 && dateIdx !== -1) {
        dataSheet.rows.forEach((row) => {
          if (
            row[dataSheet.headers[typeIdx]] === DIGITAL_REPORT_TYPE &&
            row[dataSheet.headers[brandIdx]] === "redwing"
          ) {
            digitalLeads.push({
              date: row[dataSheet.headers[dateIdx]] || "",
              actual: normalizeDigitalMetric(row[dataSheet.headers[actualIdx]]),
              contacted: normalizeDigitalMetric(row[dataSheet.headers[contactedIdx]]),
              nonContacted: normalizeDigitalMetric(row[dataSheet.headers[nonContactedIdx]]),
              interested: normalizeDigitalMetric(row[dataSheet.headers[interestedIdx]]),
            });
          }
        });
      }
    }

    const dataSheetConfig = extractDataSheetConfig(rawSheets);
    const usableSheets = rawSheets.filter((sheet) => sheet.title.trim().toUpperCase() !== DATA_SHEET_TITLE);
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
      digitalLeads: digitalLeads.sort((a, b) => a.date.localeCompare(b.date)),
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
      digitalLeads: [],
      leadTableColumns: [],
      error: message,
    };
  }
}

export const getWorkbookData = cache(async (): Promise<WorkbookData> => {
  const now = Date.now();

  // Return cached data if still fresh
  if (_cachedData && now - _cacheTimestamp < CACHE_TTL_MS) {
    return _cachedData;
  }

  // If another request is already fetching, wait for it (dedup concurrent calls)
  if (_inflightPromise) {
    return _inflightPromise;
  }

  _inflightPromise = fetchWorkbookDataInternal().then((data) => {
    _cachedData = data;
    _cacheTimestamp = Date.now();
    _inflightPromise = null;
    return data;
  }).catch((error) => {
    _inflightPromise = null;
    throw error;
  });

  return _inflightPromise;
});

function getSpreadsheetId() {
  const spreadsheetId = process.env.SHEET_ID;

  if (!spreadsheetId) {
    throw new Error("Missing SHEET_ID.");
  }

  return spreadsheetId;
}

function normalizeDigitalMetric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[,%\s]+/g, "").trim();
    if (!cleaned) return 0;

    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function normalizeDigitalDate(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("Each entry needs a date in YYYY-MM-DD format.");
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid date "${trimmed}". Use YYYY-MM-DD.`);
  }

  return trimmed;
}

function buildDigitalLeadPrompt(lastImportedDate: string | null) {
  const scopeLine = lastImportedDate
    ? `Extract only rows with a date after ${lastImportedDate}. Ignore ${lastImportedDate} and any earlier date.`
    : "Extract all visible dated rows that contain actual calling numbers.";

  return [
    "You are extracting data from a Redwing digital leads calling report image.",
    scopeLine,
    "Ignore total rows, blank rows, percentage columns, and any row where the numeric counts are missing.",
    'Return strict JSON only with this exact shape: {"entries":[{"date":"YYYY-MM-DD","actual":0,"contacted":0,"nonContacted":0,"interested":0}], "latestDateFound": "YYYY-MM-DD"}',
    "The 'latestDateFound' must be the date of the very last entry in your extracted 'entries' list.",
    "Use the report date column from the image and convert it to YYYY-MM-DD.",
    "Extract only values that are clearly visible in the image. Do not guess missing numbers.",
  ].join(" ");
}


function getDigitalDataSheet(rawSheets: RawSheet[]) {
  return rawSheets.find((sheet) => sheet.title.trim().toUpperCase() === DATA_SHEET_TITLE);
}

function getLatestImportedDigitalDate(rawSheets: RawSheet[]) {
  const dataSheet = getDigitalDataSheet(rawSheets);
  if (!dataSheet) return null;

  const reportTypeIndex = dataSheet.headers.indexOf(normalizeHeader("Report Type"));
  const reportDateIndex = dataSheet.headers.indexOf(normalizeHeader("Report Date"));

  if (reportTypeIndex === -1 || reportDateIndex === -1) return null;

  let latestDateValue: string | null = null;
  let latestDateTime = 0;

  for (const row of dataSheet.rows) {
    if (row[dataSheet.headers[reportTypeIndex]] !== DIGITAL_REPORT_TYPE) continue;

    const reportDateStr = row[dataSheet.headers[reportDateIndex]]?.trim() ?? "";
    if (!reportDateStr) continue;

    const parsed = parseDateValue(reportDateStr);
    if (!parsed) continue;

    const time = new Date(parsed).getTime();
    if (time > latestDateTime) {
      latestDateTime = time;
      latestDateValue = parsed;
    }
  }

  return latestDateValue;
}

export async function getDigitalLeadImportMeta(): Promise<DigitalLeadImportMeta> {
  const rawSheets = await fetchRawSheets();
  const lastImportedDate = getLatestImportedDigitalDate(rawSheets);

  return {
    lastImportedDate,
    prompt: buildDigitalLeadPrompt(lastImportedDate),
  };
}

async function ensureDataSheetHeaders() {
  const sheets = await getSheetsClient(["https://www.googleapis.com/auth/spreadsheets"]);
  const spreadsheetId = getSpreadsheetId();
  const range = `${DATA_SHEET_TITLE}!1:1`;
  const headerResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const existingHeaders = (headerResponse.data.values?.[0] ?? []).map((value) => String(value).trim());
  const mergedHeaders = [...existingHeaders];

  for (const header of DIGITAL_DATA_HEADERS) {
    if (!mergedHeaders.includes(header)) {
      mergedHeaders.push(header);
    }
  }

  if (mergedHeaders.length !== existingHeaders.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [mergedHeaders],
      },
    });
  }

  return mergedHeaders;
}

export async function appendDigitalLeadImport(
  entries: DigitalLeadImportEntry[],
  promptUsed: string,
) {
  if (entries.length === 0) {
    throw new Error("At least one entry is required.");
  }

  const headers = await ensureDataSheetHeaders();
  const sheets = await getSheetsClient(["https://www.googleapis.com/auth/spreadsheets"]);
  const spreadsheetId = getSpreadsheetId();
  const importedAt = new Date().toISOString();

  const values = entries.map((entry) =>
    headers.map((header) => {
      switch (header) {
        case "Report Type":
          return DIGITAL_REPORT_TYPE;
        case "Report Brand":
          return "redwing";
        case "Report Date":
          return normalizeDigitalDate(entry.date);
        case "Actual":
          return normalizeDigitalMetric(entry.actual);
        case "Contacted":
          return normalizeDigitalMetric(entry.contacted);
        case "Non Contacted":
          return normalizeDigitalMetric(entry.nonContacted);
        case "Interested":
          return normalizeDigitalMetric(entry.interested);
        case "Prompt Used":
          return promptUsed;
        case "Imported At":
          return importedAt;
        default:
          return "";
      }
    }),
  );

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${DATA_SHEET_TITLE}!A:ZZ`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values,
    },
  });

  _cachedData = null;
  _cacheTimestamp = 0;
}
