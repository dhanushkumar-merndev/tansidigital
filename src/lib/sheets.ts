import { promises as fs } from "fs";
import path from "path";
import type { DatabaseSync } from "node:sqlite";

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
  campaignAliasesByTab: Map<string, string[]>;
  canonicalTabByLookup: Map<string, string>;
  tabLabels: Map<string, string>;
  leadTableColumns: LeadTableColumn[];
  leadCountByTab: Map<string, number>;
  leadCountSignature: string;
  redwingLocationLabels: string[];
  tabs: string[];
};

type LeadCountState = {
  countByTab: Map<string, number>;
  signature: string;
};

type WorkbookSnapshot = {
  version: 1;
  generatedAt: string;
  leadCountSignature: string;
  leadCountByTab: Record<string, number>;
  brandByTab: Record<string, ConcreteBrand>;
  canonicalTabByLookup: Record<string, string>;
  tabLabels: Record<string, string>;
  sheetTitleByTab: Record<string, string>;
  tabs: string[];
  rowsByTab: Record<string, DashboardRow[]>;
  digitalLeads: DigitalLeadImportEntry[];
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
  tabLabels: Record<string, string>;
  leadTableColumns: LeadTableColumn[];
  error?: string;
};

export type LeadsTableRow = Pick<
  DashboardRow,
  | "id"
  | "tabName"
  | "date"
  | "brand"
  | "campaign"
  | "adName"
  | "formName"
  | "platform"
  | "location"
  | "fullName"
  | "phoneNumber"
  | "email"
  | "leadStatus"
  | "isOrganic"
  | "leadCount"
  | "raw"
>;

export type LeadsSortDirection = "asc" | "desc";

export type LeadsPageQuery = {
  brand: ConcreteBrand;
  campaigns: string[];
  from: string | null;
  page: number;
  q: string;
  sort: LeadsSortDirection;
  to: string | null;
};

export type LeadsPageData = {
  campaignOptions: string[];
  error?: string;
  page: number;
  pageSize: number;
  rows: LeadsTableRow[];
  total: number;
  totalPages: number;
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

export type DashboardNamedCount = {
  name: string;
  value: number;
};

export type DashboardHourlyBreakdown = {
  hour: number;
  total: number;
  bigwing: number;
  redwing: number;
};

export type DashboardPlatformCounts = {
  fb: number;
  ig: number;
};

export type DashboardDailySummary = {
  date: string;
  totalLeads: number;
  bigwingLeads: number;
  redwingLeads: number;
  bigwingInstagramLeads: number;
  bigwingFacebookLeads: number;
  redwingInstagramLeads: number;
  redwingFacebookLeads: number;
  leadCountsByTab: Record<string, number>;
  bigwingInstagramCountsByTab: Record<string, number>;
  bigwingFacebookCountsByTab: Record<string, number>;
  redwingInstagramCountsByTab: Record<string, number>;
  redwingFacebookCountsByTab: Record<string, number>;
  hourlyBreakdownByTab: Record<string, string[]>;
  bigwingResponseCountsByTab: Record<string, { yes: number; no: number }>;
  platformCountsByTab: Record<string, DashboardPlatformCounts>;
  redwingLocationCountsByTab: Record<string, number[]>;
  topCampaignCountsByTab: Record<string, number>;
};

export type DashboardData = {
  campaignAliasesByTab: Record<string, string[]>;
  digitalLeads: DigitalLeadImportEntry[];
  leadCountByTab: Record<string, number>;
  redwingLocationLabels: string[];
  tabs: string[];
  tabBrandLookup: Record<string, ConcreteBrand>;
  tabLabels: Record<string, string>;
  dailySummaries: DashboardDailySummary[];
  error?: string;
};

const DATA_SHEET_TITLE = "DATA";
const DIGITAL_REPORT_TYPE = "redwing_digital_leads";
const DEFAULT_REDWING_LOCATION_LABELS = [
  "gunjur",
  "whitefield",
  "marathahalli",
  "hoodi",
  "hrbrlayout",
  "seegehalli",
  "panathur",
];
const LEADS_PAGE_SIZE = 100;
const LEADS_INDEX_SCHEMA_VERSION = "2";
const SNAPSHOT_SOURCE_PATH = path.join(process.cwd(), "data", "workbook-snapshot.json");
const IS_CLOUD_ENVIRONMENT = process.env.NODE_ENV === "production" || !!process.env.VERCEL || !!process.env.AWS_REGION;

const SNAPSHOT_RUNTIME_PATH = (() => {
  const configuredPath = process.env.WORKBOOK_SNAPSHOT_PATH?.trim();
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(process.cwd(), configuredPath);
  }

  if (IS_CLOUD_ENVIRONMENT) {
    return path.join("/tmp", "workbook-snapshot.json");
  }

  return SNAPSHOT_SOURCE_PATH;
})();
const SNAPSHOT_READ_PATHS = Array.from(new Set([SNAPSHOT_RUNTIME_PATH, SNAPSHOT_SOURCE_PATH]));
const LEADS_INDEX_SOURCE_PATH = path.join(process.cwd(), "data", "workbook-leads.sqlite");
const LEADS_INDEX_RUNTIME_PATH = (() => {
  const configuredPath = process.env.WORKBOOK_LEADS_INDEX_PATH?.trim();
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(process.cwd(), configuredPath);
  }

  if (IS_CLOUD_ENVIRONMENT) {
    return path.join("/tmp", "workbook-leads.sqlite");
  }

  return LEADS_INDEX_SOURCE_PATH;
})();
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
const DIGITAL_DATA_HEADER_RANGE = `${DATA_SHEET_TITLE}!F1:N1`;
const DIGITAL_DATA_APPEND_RANGE = `${DATA_SHEET_TITLE}!F:N`;

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

  // Google Sheets may return date serials like "46128" for user-entered dates.
  if (/^\d{5,}$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (Number.isFinite(serial)) {
      const utcTime = Date.UTC(1899, 11, 30) + serial * 24 * 60 * 60 * 1000;
      return formatDateInIst(new Date(utcTime));
    }
  }

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

function parseDayFirstDateValue(value: string | undefined) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) {
    return parseDateValue(trimmed);
  }

  const [, first, second, third] = match;
  const year = third.length === 2 ? `20${third}` : third;
  const day = Number(first);
  const month = Number(second);
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
    .split(/[\n|]+/)
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

function addCanonicalTabEntry(
  canonicalTabByLookup: Map<string, string>,
  canonicalTabName: string,
  value: string,
) {
  const normalizedValue = normalizeLookupKey(expandAliases(value));
  if (!normalizedValue) return;

  canonicalTabByLookup.set(normalizedValue, expandAliases(canonicalTabName));
}

function addCampaignAliasEntry(
  campaignAliasesByTab: Map<string, string[]>,
  canonicalTabName: string,
  value: string,
) {
  const alias = expandAliases(value).trim();
  if (!alias) return;

  const key = expandAliases(canonicalTabName);
  const existing = campaignAliasesByTab.get(key) ?? [];

  if (!existing.includes(alias)) {
    campaignAliasesByTab.set(key, [...existing, alias]);
  }
}

function formatColumnLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sumRecordValues(record: Record<string, number>) {
  return Object.values(record).reduce((total, value) => total + value, 0);
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map((alias) => normalizeHeader(alias));
  return headers.findIndex((header) => normalizedAliases.includes(header));
}

function normalizeCountMetric(value: unknown) {
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

type LooseArrayValue = string | LooseArrayValue[];

function extractBracketExpression(value: string) {
  const start = value.indexOf("[");
  if (start === -1) {
    return "";
  }

  let depth = 0;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return "";
}

function parseLooseArrayExpression(value: string): LooseArrayValue[] | null {
  const source = extractBracketExpression(value).trim();
  if (!source.startsWith("[") || !source.endsWith("]")) {
    return null;
  }

  let index = 0;

  function skipWhitespace() {
    while (index < source.length && /\s/.test(source[index] ?? "")) {
      index += 1;
    }
  }

  function parseValue(): LooseArrayValue | null {
    skipWhitespace();

    if ((source[index] ?? "") === "[") {
      return parseArray();
    }

    const start = index;
    while (index < source.length) {
      const char = source[index] ?? "";
      if (char === "," || char === "]") {
        break;
      }
      index += 1;
    }

    return source.slice(start, index).trim();
  }

  function parseArray(): LooseArrayValue[] {
    const items: LooseArrayValue[] = [];

    if ((source[index] ?? "") !== "[") {
      return items;
    }

    index += 1;

    while (index < source.length) {
      skipWhitespace();

      if ((source[index] ?? "") === "]") {
        index += 1;
        break;
      }

      const nextValue = parseValue();
      if (nextValue != null && nextValue !== "") {
        items.push(nextValue);
      }

      skipWhitespace();
      if ((source[index] ?? "") === ",") {
        index += 1;
      }
    }

    return items;
  }

  return parseArray();
}

function flattenLooseNumericValues(value: LooseArrayValue): number[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenLooseNumericValues(item));
  }

  return [normalizeCountMetric(value)];
}

function normalizeLooseTextValue(value: LooseArrayValue) {
  return Array.isArray(value) ? "" : value.trim();
}

function parseOrderedLabelList(value: string) {
  const parsed = parseLooseArrayExpression(value);

  if (parsed) {
    return parsed
      .map((item) => normalizeLooseTextValue(item))
      .filter(Boolean);
  }

  return value
    .split(/[|\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

type ParsedTabMetric = {
  byTab: Record<string, number>;
  total: number;
};

function parseTabMetricCell(value: unknown, tabs: string[]): ParsedTabMetric {
  const emptyMetric: ParsedTabMetric = {
    byTab: {},
    total: 0,
  };

  if (value == null) {
    return emptyMetric;
  }

  const rawValue = String(value).trim();
  if (!rawValue) {
    return emptyMetric;
  }

  const totalMatch = rawValue.match(/=\s*(-?\d+(?:\.\d+)?)(?![\s\S]*=)/);
  const explicitTotal =
    totalMatch && totalMatch[1] ? normalizeCountMetric(totalMatch[1]) : null;
  const parsedArray = parseLooseArrayExpression(rawValue);
  const values =
    parsedArray?.flatMap((item) => flattenLooseNumericValues(item)) ?? [];

  const byTab: Record<string, number> = {};

  values.slice(0, tabs.length).forEach((count, index) => {
    const tab = tabs[index];
    if (!tab) return;
    byTab[tab] = count;
  });

  if (values.length === 0 && tabs.length === 1) {
    byTab[tabs[0]] = explicitTotal ?? normalizeCountMetric(rawValue);
  }

  return {
    byTab,
    total:
      explicitTotal ??
      (values.length > 0
        ? values.reduce((total, item) => total + item, 0)
        : normalizeCountMetric(rawValue)),
  };
}

function parseHourlyBreakdownCell(
  value: unknown,
  tabs: string[],
): Record<string, string[]> {
  const emptyBreakdown: Record<string, string[]> = {};

  if (value == null) {
    return emptyBreakdown;
  }

  const rawValue = String(value).trim();
  if (!rawValue) {
    return emptyBreakdown;
  }

  const parsedArray = parseLooseArrayExpression(rawValue);
  if (!parsedArray) {
    return emptyBreakdown;
  }

  parsedArray.slice(0, tabs.length).forEach((item, index) => {
    if (!Array.isArray(item)) {
      return;
    }

    const tab = tabs[index];
    if (!tab) {
      return;
    }

    emptyBreakdown[tab] = item
      .map((part) => normalizeLooseTextValue(part))
      .filter(Boolean);
  });

  return emptyBreakdown;
}

function parseBigwingResponseCell(
  value: unknown,
  tabs: string[],
): Record<string, { yes: number; no: number }> {
  const responseByTab: Record<string, { yes: number; no: number }> = {};

  if (value == null) {
    return responseByTab;
  }

  const rawValue = String(value).trim();
  if (!rawValue) {
    return responseByTab;
  }

  const parsedArray = parseLooseArrayExpression(rawValue);
  if (!parsedArray) {
    return responseByTab;
  }

  parsedArray.slice(0, tabs.length).forEach((item, index) => {
    if (!Array.isArray(item)) {
      return;
    }

    const tab = tabs[index];
    if (!tab) {
      return;
    }

    responseByTab[tab] = {
      yes: normalizeCountMetric(item[0]),
      no: normalizeCountMetric(item[1]),
    };
  });

  return responseByTab;
}

function parseRedwingLocationCountCell(
  value: unknown,
  tabs: string[],
): Record<string, number[]> {
  const countsByTab: Record<string, number[]> = {};

  if (value == null) {
    return countsByTab;
  }

  const rawValue = String(value).trim();
  if (!rawValue) {
    return countsByTab;
  }

  const parsedArray = parseLooseArrayExpression(rawValue);
  if (!parsedArray) {
    return countsByTab;
  }

  parsedArray.slice(0, tabs.length).forEach((item, index) => {
    if (!Array.isArray(item)) {
      return;
    }

    const tab = tabs[index];
    if (!tab) {
      return;
    }

    countsByTab[tab] = item.map((part) => normalizeCountMetric(part));
  });

  return countsByTab;
}

function parsePlatformMetricCell(
  value: unknown,
  tabs: string[],
): Record<string, DashboardPlatformCounts> {
  const countsByTab: Record<string, DashboardPlatformCounts> = {};

  if (value == null) {
    return countsByTab;
  }

  const rawValue = String(value).trim();
  if (!rawValue) {
    return countsByTab;
  }

  const parsedArray = parseLooseArrayExpression(rawValue);
  if (!parsedArray) {
    return countsByTab;
  }

  parsedArray.slice(0, tabs.length).forEach((item, index) => {
    if (!Array.isArray(item)) {
      return;
    }

    const tab = tabs[index];
    if (!tab) {
      return;
    }

    let fb = 0;
    let ig = 0;

    for (const part of item) {
      const parsedPart = parseMetricPair(normalizeLooseTextValue(part));
      if (!parsedPart) {
        continue;
      }

      const key = normalizeLookupKey(parsedPart.name);
      const count = normalizeCountMetric(parsedPart.value);

      if (key === "ig" || key === "instagram") {
        ig += count;
      } else if (key === "fb" || key === "facebook") {
        fb += count;
      }
    }

    countsByTab[tab] = { fb, ig };
  });

  return countsByTab;
}

function mapNamedCountsToTabs(
  counts: DashboardNamedCount[],
  canonicalTabByLookup: Map<string, string>,
) {
  const countsByTab: Record<string, number> = {};

  for (const count of counts) {
    const canonicalTabName =
      canonicalTabByLookup.get(normalizeLookupKey(expandAliases(count.name))) ??
      expandAliases(count.name);
    if (!canonicalTabName) {
      continue;
    }

    countsByTab[canonicalTabName] =
      (countsByTab[canonicalTabName] ?? 0) + count.value;
  }

  return countsByTab;
}

function getTabsForBrand(
  tabs: string[],
  brandByTab: Map<string, ConcreteBrand>,
  brand: ConcreteBrand,
) {
  return tabs.filter((tab) => brandByTab.get(normalizeLookupKey(tab)) === brand);
}

function buildTabBrandLookup(dataSheetConfig: DataSheetConfig) {
  const tabBrandLookup: Record<string, ConcreteBrand> = {};

  for (const tab of dataSheetConfig.tabs) {
    const brand = dataSheetConfig.brandByTab.get(normalizeLookupKey(tab));
    if (brand) {
      tabBrandLookup[tab] = brand;
    }
  }

  return tabBrandLookup;
}

function parseMetricPair(entry: string) {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  for (const delimiter of ["::", "="]) {
    const index = trimmed.lastIndexOf(delimiter);
    if (index > 0) {
      return {
        name: trimmed.slice(0, index).trim(),
        value: trimmed.slice(index + delimiter.length).trim(),
      };
    }
  }

  const colonIndex = trimmed.lastIndexOf(":");
  if (colonIndex > 0) {
    return {
      name: trimmed.slice(0, colonIndex).trim(),
      value: trimmed.slice(colonIndex + 1).trim(),
    };
  }

  return null;
}

function parseNamedCounts(value: unknown): DashboardNamedCount[] {
  if (typeof value !== "string") {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;

      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => {
            if (Array.isArray(item) && item.length >= 2) {
              return {
                name: String(item[0] ?? "").trim(),
                value: normalizeCountMetric(item[1]),
              };
            }

            if (item && typeof item === "object") {
              const entry = item as { name?: unknown; label?: unknown; value?: unknown; count?: unknown };
              return {
                name: String(entry.name ?? entry.label ?? "").trim(),
                value: normalizeCountMetric(entry.value ?? entry.count),
              };
            }

            return null;
          })
          .filter((item): item is DashboardNamedCount => Boolean(item?.name));
      }

      if (parsed && typeof parsed === "object") {
        return Object.entries(parsed as Record<string, unknown>)
          .map(([name, count]) => ({
            name: String(name).trim(),
            value: normalizeCountMetric(count),
          }))
          .filter((item) => item.name);
      }
    } catch {
      // Fall through to the delimiter-based parser.
    }
  }

  const looseArray = parseLooseArrayExpression(trimmed);
  if (looseArray) {
    return looseArray
      .map((item) => normalizeLooseTextValue(item))
      .filter(Boolean)
      .map((item) => parseMetricPair(item))
      .filter((item): item is NonNullable<typeof item> => Boolean(item?.name))
      .map((item) => ({
        name: item.name,
        value: normalizeCountMetric(item.value),
      }))
      .filter((item) => item.name);
  }

  return trimmed
    .split("|")
    .map((segment) => parseMetricPair(segment))
    .filter((item): item is NonNullable<typeof item> => Boolean(item?.name))
    .map((item) => ({
      name: item.name,
      value: normalizeCountMetric(item.value),
    }))
    .filter((item) => item.name);
}

function parseHourlyBreakdown(value: unknown): DashboardHourlyBreakdown[] {
  if (typeof value !== "string") {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;

      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => {
            if (!item || typeof item !== "object") {
              return null;
            }

            const breakdown = item as {
              hour?: unknown;
              total?: unknown;
              count?: unknown;
              bigwing?: unknown;
              redwing?: unknown;
            };

            return {
              hour: Number(breakdown.hour ?? 0),
              total: normalizeCountMetric(breakdown.total ?? breakdown.count),
              bigwing: normalizeCountMetric(breakdown.bigwing),
              redwing: normalizeCountMetric(breakdown.redwing),
            };
          })
          .filter((item): item is DashboardHourlyBreakdown => {
            if (item == null) {
              return false;
            }

            return Number.isFinite(item.hour) && item.hour >= 0 && item.hour <= 23;
          })
          .sort((left, right) => left.hour - right.hour);
      }

      if (parsed && typeof parsed === "object") {
        return Object.entries(parsed as Record<string, unknown>)
          .map(([hour, count]) => {
            const parsedHour = Number(hour);
            if (!Number.isFinite(parsedHour)) {
              return null;
            }

            if (count && typeof count === "object") {
              const breakdown = count as { total?: unknown; count?: unknown; bigwing?: unknown; redwing?: unknown };
              return {
                hour: parsedHour,
                total: normalizeCountMetric(breakdown.total ?? breakdown.count),
                bigwing: normalizeCountMetric(breakdown.bigwing),
                redwing: normalizeCountMetric(breakdown.redwing),
              };
            }

            return {
              hour: parsedHour,
              total: normalizeCountMetric(count),
              bigwing: 0,
              redwing: 0,
            };
          })
          .filter((item): item is DashboardHourlyBreakdown => {
            if (item == null) {
              return false;
            }

            return Number.isFinite(item.hour) && item.hour >= 0 && item.hour <= 23;
          })
          .sort((left, right) => left.hour - right.hour);
      }
    } catch {
      // Fall through to the delimiter-based parser.
    }
  }

  return trimmed
    .split("|")
    .map((segment) => parseMetricPair(segment))
    .filter((item): item is NonNullable<typeof item> => Boolean(item?.name))
    .map((item) => {
      const [total, bigwing, redwing] = item.value.split(",").map((part) => normalizeCountMetric(part));
      const hour = Number(item.name);

      return {
        hour,
        total,
        bigwing: bigwing ?? 0,
        redwing: redwing ?? 0,
      };
    })
    .filter((item) => Number.isFinite(item.hour) && item.hour >= 0 && item.hour <= 23)
    .sort((left, right) => left.hour - right.hour);
}

function buildCampaignAliasesLookup(dataSheetConfig: DataSheetConfig) {
  return Object.fromEntries(dataSheetConfig.campaignAliasesByTab.entries());
}

function extractDataSheetConfig(rawSheets: RawSheet[]): DataSheetConfig {
  const dataSheet = rawSheets.find((sheet) => sheet.title.trim().toUpperCase() === DATA_SHEET_TITLE);
  const brandByTab = new Map<string, ConcreteBrand>();
  const campaignAliasesByTab = new Map<string, string[]>();
  const canonicalTabByLookup = new Map<string, string>();
  const tabLabels = new Map<string, string>();
  const leadTableColumns: LeadTableColumn[] = [];
  const leadCountByTab = new Map<string, number>();
  const redwingLocationLabels = new Set<string>();
  const tabs = new Set<string>();
  const seenColumns = new Set<string>();

  if (!dataSheet) {
    return {
      brandByTab,
      campaignAliasesByTab,
      canonicalTabByLookup,
      tabLabels,
      leadTableColumns,
      leadCountByTab,
      leadCountSignature: "",
      redwingLocationLabels: [],
      tabs: [],
    };
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
    const rawLeadCount = getFirstValue(row, ["lead_count", "count", "row_count", "total_leads"]);
    const leadCount = Number.parseInt(rawLeadCount, 10);
    const locationLabelsValue = getFirstValue(row, [
      "unique_location",
      "unique_locations",
      "redwing_location_order",
      "location_order",
      "location_labels",
    ]);

    if (tabName && brand) {
      const expandedTab = expandAliases(tabName);
      tabs.add(expandedTab);
      if (tabAliases) {
        tabLabels.set(expandedTab, tabAliases.trim());
      }
      addBrandMappingEntry(brandByTab, brand, tabName);
      addCanonicalTabEntry(canonicalTabByLookup, tabName, tabName);
      addCampaignAliasEntry(campaignAliasesByTab, tabName, tabName);

      if (Number.isFinite(leadCount) && leadCount >= 0) {
        leadCountByTab.set(expandAliases(tabName), leadCount);
      }

      for (const alias of splitMappingValues(tabAliases)) {
        addBrandMappingEntry(brandByTab, brand, alias);
        addCanonicalTabEntry(canonicalTabByLookup, tabName, alias);
        addCampaignAliasEntry(campaignAliasesByTab, tabName, alias);
      }
    }

    for (const label of parseOrderedLabelList(locationLabelsValue)) {
      const trimmedLabel = label.trim();
      if (trimmedLabel) {
        redwingLocationLabels.add(trimmedLabel);
      }
    }

    if (tableColumnKey && !seenColumns.has(tableColumnKey)) {
      leadTableColumns.push({ key: tableColumnKey, label: tableColumnLabel });
      seenColumns.add(tableColumnKey);
    }
  }

  const leadCountSignature = Array.from(leadCountByTab.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tabName, count]) => `${tabName}:${count}`)
    .join("|");

  return {
    brandByTab,
    campaignAliasesByTab,
    canonicalTabByLookup,
    tabLabels,
    leadTableColumns,
    leadCountByTab,
    leadCountSignature,
    redwingLocationLabels:
      redwingLocationLabels.size > 0
        ? Array.from(redwingLocationLabels.values())
        : DEFAULT_REDWING_LOCATION_LABELS,
    tabs: Array.from(tabs.values()),
  };
}

function parseDigitalLeadEntries(dataSheet: RawSheet | undefined) {
  const digitalLeads: DigitalLeadImportEntry[] = [];

  if (!dataSheet) {
    return digitalLeads;
  }

  const typeIdx = dataSheet.headers.indexOf(normalizeHeader("Report Type"));
  const brandIdx = dataSheet.headers.indexOf(normalizeHeader("Report Brand"));
  const dateIdx = dataSheet.headers.indexOf(normalizeHeader("Report Date"));
  const actualIdx = dataSheet.headers.indexOf(normalizeHeader("Actual"));
  const contactedIdx = dataSheet.headers.indexOf(normalizeHeader("Contacted"));
  const nonContactedIdx = dataSheet.headers.indexOf(normalizeHeader("Non Contacted"));
  const interestedIdx = dataSheet.headers.indexOf(normalizeHeader("Interested"));

  if (typeIdx === -1 || brandIdx === -1 || dateIdx === -1) {
    return digitalLeads;
  }

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

  return digitalLeads.sort((a, b) => a.date.localeCompare(b.date));
}

function parseDashboardDailySummaries(dataSheet: RawSheet | undefined) {
  const summaries: DashboardDailySummary[] = [];

  if (!dataSheet) {
    return summaries;
  }

  const dataSheetConfig = extractDataSheetConfig([dataSheet]);
  const tabs = dataSheetConfig.tabs;
  const bigwingTabs = getTabsForBrand(tabs, dataSheetConfig.brandByTab, "bigwing");
  const redwingTabs = getTabsForBrand(tabs, dataSheetConfig.brandByTab, "redwing");
  const groupedTabs = [...bigwingTabs, ...redwingTabs];
  const summaryDateIdx = findHeaderIndex(dataSheet.headers, ["Date"]);
  const reportDateIdx = findHeaderIndex(dataSheet.headers, ["Report Date"]);
  const totalLeadCampaignIdx = findHeaderIndex(dataSheet.headers, [
    "Total Leads Campaign",
    "Total Leads campaign",
    "Total Leads",
  ]);
  const bigwingInstagramLeadsIdx = findHeaderIndex(dataSheet.headers, [
    "Bigwing Instagram Leads",
    "Bigwing IG Leads",
  ]);
  const bigwingFacebookLeadsIdx = findHeaderIndex(dataSheet.headers, [
    "Bigwing Facebook Leads",
    "Bigwing FB Leads",
  ]);
  const bigwingPlatformIdx = findHeaderIndex(dataSheet.headers, [
    "Bigwing Platform",
    "Bigwing Platforms",
  ]);
  const redwingInstagramLeadsIdx = findHeaderIndex(dataSheet.headers, [
    "Redwing Instagram Leads",
    "Redwing IG Leads",
  ]);
  const redwingFacebookLeadsIdx = findHeaderIndex(dataSheet.headers, [
    "Redwing Facebook Leads",
    "Redwing FB Leads",
  ]);
  const redwingPlatformIdx = findHeaderIndex(dataSheet.headers, [
    "Redwing Platform",
    "Redwing Platforms",
  ]);
  const hourlyBreakdownIdx = findHeaderIndex(dataSheet.headers, [
    "Hourly Breakdown",
  ]);
  const topCampaignsIdx = findHeaderIndex(dataSheet.headers, [
    "Top Campaign",
    "Top Campaigns",
    "Campaign Counts",
  ]);
  const bigwingResponseCountsIdx = findHeaderIndex(dataSheet.headers, [
    "Bigwing Response Counts",
  ]);
  const redwingLocationCountsIdx = findHeaderIndex(dataSheet.headers, [
    "Redwing Location Counts",
  ]);

  if ((summaryDateIdx === -1 && reportDateIdx === -1) || totalLeadCampaignIdx === -1) {
    return summaries;
  }

  for (const row of dataSheet.rows) {
    const rawLeadCounts =
      row[dataSheet.headers[totalLeadCampaignIdx]]?.trim() ?? "";
    if (!rawLeadCounts) {
      continue;
    }

    const summaryDateValue =
      (summaryDateIdx === -1 ? "" : row[dataSheet.headers[summaryDateIdx]]) ||
      (reportDateIdx === -1 ? "" : row[dataSheet.headers[reportDateIdx]]);
    const date =
      summaryDateIdx !== -1
        ? parseDayFirstDateValue(summaryDateValue)
        : parseDateValue(summaryDateValue);
    if (!date) {
      continue;
    }

    const totalLeadMetric = parseTabMetricCell(rawLeadCounts, groupedTabs);
    const leadCountsByTab = totalLeadMetric.byTab;
    const bigwingInstagramMetric =
      bigwingInstagramLeadsIdx === -1
        ? { byTab: {}, total: 0 }
        : parseTabMetricCell(
            row[dataSheet.headers[bigwingInstagramLeadsIdx]],
            bigwingTabs,
          );
    const bigwingFacebookMetric =
      bigwingFacebookLeadsIdx === -1
        ? { byTab: {}, total: 0 }
        : parseTabMetricCell(
            row[dataSheet.headers[bigwingFacebookLeadsIdx]],
            bigwingTabs,
          );
    const redwingInstagramMetric =
      redwingInstagramLeadsIdx === -1
        ? { byTab: {}, total: 0 }
        : parseTabMetricCell(
            row[dataSheet.headers[redwingInstagramLeadsIdx]],
            redwingTabs,
          );
    const redwingFacebookMetric =
      redwingFacebookLeadsIdx === -1
        ? { byTab: {}, total: 0 }
        : parseTabMetricCell(
            row[dataSheet.headers[redwingFacebookLeadsIdx]],
            redwingTabs,
          );
    const bigwingInstagramCountsByTab = bigwingInstagramMetric.byTab;
    const bigwingFacebookCountsByTab = bigwingFacebookMetric.byTab;
    const redwingInstagramCountsByTab = redwingInstagramMetric.byTab;
    const redwingFacebookCountsByTab = redwingFacebookMetric.byTab;
    const bigwingPlatformCountsByTab =
      bigwingPlatformIdx === -1
        ? {}
        : parsePlatformMetricCell(
            row[dataSheet.headers[bigwingPlatformIdx]],
            bigwingTabs,
          );
    const redwingPlatformCountsByTab =
      redwingPlatformIdx === -1
        ? {}
        : parsePlatformMetricCell(
            row[dataSheet.headers[redwingPlatformIdx]],
            redwingTabs,
          );
    const hourlyBreakdownByTab =
      hourlyBreakdownIdx === -1
        ? {}
        : parseHourlyBreakdownCell(
            row[dataSheet.headers[hourlyBreakdownIdx]],
            groupedTabs,
          );
    const topCampaignCountsByTab =
      topCampaignsIdx === -1
        ? {}
        : mapNamedCountsToTabs(
            parseNamedCounts(row[dataSheet.headers[topCampaignsIdx]]),
            dataSheetConfig.canonicalTabByLookup,
          );
    const bigwingResponseCountsByTab =
      bigwingResponseCountsIdx === -1
        ? {}
        : parseBigwingResponseCell(
            row[dataSheet.headers[bigwingResponseCountsIdx]],
            bigwingTabs,
          );
    const redwingLocationCountsByTab =
      redwingLocationCountsIdx === -1
        ? {}
        : parseRedwingLocationCountCell(
            row[dataSheet.headers[redwingLocationCountsIdx]],
            redwingTabs,
          );

    const totalLeads = totalLeadMetric.total;
    const bigwingLeads = bigwingTabs.reduce(
      (total, tab) => total + (leadCountsByTab[tab] ?? 0),
      0,
    );
    const redwingLeads = redwingTabs.reduce(
      (total, tab) => total + (leadCountsByTab[tab] ?? 0),
      0,
    );
    const platformCountsByTab: Record<string, DashboardPlatformCounts> = {};

    for (const tab of tabs) {
      const explicitCounts =
        bigwingPlatformCountsByTab[tab] ?? redwingPlatformCountsByTab[tab];
      platformCountsByTab[tab] = explicitCounts ?? {
        fb:
          (bigwingFacebookCountsByTab[tab] ?? 0) +
          (redwingFacebookCountsByTab[tab] ?? 0),
        ig:
          (bigwingInstagramCountsByTab[tab] ?? 0) +
          (redwingInstagramCountsByTab[tab] ?? 0),
      };
    }

    summaries.push({
      date,
      totalLeads,
      bigwingLeads,
      redwingLeads,
      bigwingInstagramLeads: bigwingInstagramMetric.total,
      bigwingFacebookLeads: bigwingFacebookMetric.total,
      redwingInstagramLeads: redwingInstagramMetric.total,
      redwingFacebookLeads: redwingFacebookMetric.total,
      leadCountsByTab,
      bigwingInstagramCountsByTab,
      bigwingFacebookCountsByTab,
      redwingInstagramCountsByTab,
      redwingFacebookCountsByTab,
      hourlyBreakdownByTab,
      bigwingResponseCountsByTab,
      platformCountsByTab,
      redwingLocationCountsByTab,
      topCampaignCountsByTab:
        Object.keys(topCampaignCountsByTab).length > 0
          ? topCampaignCountsByTab
          : leadCountsByTab,
    });
  }

  return summaries.sort((a, b) => a.date.localeCompare(b.date));
}

function mapToRecord<T>(map: Map<string, T>) {
  return Object.fromEntries(map.entries());
}

function recordToMap<T>(record: Record<string, T>) {
  return new Map(Object.entries(record));
}

function buildWorkbookSnapshot(
  rawSheets: RawSheet[],
  dataSheetConfig: DataSheetConfig,
): WorkbookSnapshot {
  const usableSheets = rawSheets.filter((sheet) => sheet.title.trim().toUpperCase() !== DATA_SHEET_TITLE);
  const rowsByTab: Record<string, DashboardRow[]> = {};
  const sheetTitleByTab: Record<string, string> = {};
  const tabs = usableSheets.map((sheet) => expandAliases(sheet.title));

  usableSheets.forEach((sheet) => {
    const expandedTabName = expandAliases(sheet.title);
    rowsByTab[expandedTabName] = sheet.rows
      .filter((row) => Object.values(row).some(Boolean))
      .map((row, index) => normalizeRow(sheet.title, row, index, dataSheetConfig));
    sheetTitleByTab[expandedTabName] = sheet.title;
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    leadCountSignature: dataSheetConfig.leadCountSignature,
    leadCountByTab: mapToRecord(dataSheetConfig.leadCountByTab),
    brandByTab: mapToRecord(dataSheetConfig.brandByTab),
    canonicalTabByLookup: mapToRecord(dataSheetConfig.canonicalTabByLookup),
    tabLabels: mapToRecord(dataSheetConfig.tabLabels || new Map()),
    sheetTitleByTab: sheetTitleByTab,
    tabs,
    rowsByTab,
    digitalLeads: parseDigitalLeadEntries(
      rawSheets.find((sheet) => sheet.title.trim().toUpperCase() === DATA_SHEET_TITLE),
    ),
    leadTableColumns: dataSheetConfig.leadTableColumns,
  };
}

function buildWorkbookDataFromSnapshot(snapshot: WorkbookSnapshot): WorkbookData {
  const spreadsheetId = process.env.SHEET_ID ?? "";
  const defaultTabName = process.env.TAB_NAME ?? "DATA";
  const rows = snapshot.tabs.flatMap((tab) => snapshot.rowsByTab[tab] ?? []);

  return {
    sheetId: spreadsheetId,
    defaultTabName,
    tabs: snapshot.tabs,
    tabLabels: snapshot.tabLabels || {},
    rows: rows,
    digitalLeads: snapshot.digitalLeads,
    leadTableColumns: snapshot.leadTableColumns,
  };
}

async function ensureSnapshotDirectory() {
  await fs.mkdir(path.dirname(SNAPSHOT_RUNTIME_PATH), { recursive: true });
}

async function readWorkbookSnapshotFromPath(snapshotPath: string) {
  try {
    const contents = await fs.readFile(snapshotPath, "utf8");
    const parsed = JSON.parse(contents) as WorkbookSnapshot;

    if (parsed.version !== 1) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function readWorkbookSnapshot() {
  for (const snapshotPath of SNAPSHOT_READ_PATHS) {
    const snapshot = await readWorkbookSnapshotFromPath(snapshotPath);
    if (snapshot) {
      return snapshot;
    }
  }

  return null;
}

async function writeWorkbookSnapshot(snapshot: WorkbookSnapshot) {
  try {
    await ensureSnapshotDirectory();
    await fs.writeFile(SNAPSHOT_RUNTIME_PATH, JSON.stringify(snapshot), "utf8");
  } catch (error) {
    console.warn(
      `Unable to write workbook snapshot at ${SNAPSHOT_RUNTIME_PATH}:`,
      error,
    );
  }
}

async function getWorkbookSnapshotTimestamp() {
  let latestTimestamp = 0;

  for (const snapshotPath of SNAPSHOT_READ_PATHS) {
    try {
      const stats = await fs.stat(snapshotPath);
      latestTimestamp = Math.max(latestTimestamp, stats.mtimeMs);
    } catch {
      // Ignore missing snapshot paths and keep checking fallbacks.
    }
  }

  return latestTimestamp;
}

type LeadsIndexRow = {
  ad_name: string;
  brand: string;
  campaign: string;
  date: string;
  email: string;
  form_name: string;
  full_name: string;
  id: string;
  is_organic: number;
  lead_count: number;
  lead_status: string;
  location: string;
  phone_number: string;
  platform: string;
  tab_name: string;
};

function buildLeadsSearchText(row: DashboardRow) {
  return [
    row.tabName,
    row.campaign,
    row.fullName,
    row.email,
    row.phoneNumber,
    row.location,
    row.date ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function createLeadsIndexSignature(rows: DashboardRow[]) {
  return `fallback:${rows.length}:${rows.at(0)?.id ?? ""}:${rows.at(-1)?.id ?? ""}`;
}

async function ensureLeadsIndexDirectory() {
  await fs.mkdir(path.dirname(LEADS_INDEX_RUNTIME_PATH), { recursive: true });
}

async function openLeadsIndexDatabase() {
  const { DatabaseSync } = await import(
    /* webpackIgnore: true */
    /* turbopackIgnore: true */
    "node:sqlite"
  );
  const database = new DatabaseSync(LEADS_INDEX_RUNTIME_PATH);

  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      tab_name TEXT NOT NULL,
      date TEXT NOT NULL,
      brand TEXT NOT NULL,
      campaign TEXT NOT NULL,
      ad_name TEXT NOT NULL,
      form_name TEXT NOT NULL,
      platform TEXT NOT NULL,
      location TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      email TEXT NOT NULL,
      lead_status TEXT NOT NULL,
      is_organic INTEGER NOT NULL,
      lead_count INTEGER NOT NULL,
      search_text TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS leads_search USING fts5(
      id UNINDEXED,
      search_text,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TABLE IF NOT EXISTS leads_index_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_leads_brand_campaign ON leads (brand, campaign);
    CREATE INDEX IF NOT EXISTS idx_leads_brand_date_id ON leads (brand, date, id);
  `);

  return database;
}

async function getLeadsIndexSource() {
  const snapshot = await readWorkbookSnapshot();

  if (snapshot) {
    return {
      error: undefined,
      rows: snapshot.tabs.flatMap((tab) => snapshot.rowsByTab[tab] ?? []),
      signature: `${snapshot.generatedAt}:${snapshot.leadCountSignature}`,
    };
  }

  const workbook = await getWorkbookData();

  return {
    error: workbook.error,
    rows: workbook.rows,
    signature: createLeadsIndexSignature(workbook.rows),
  };
}

function rebuildLeadsIndex(database: DatabaseSync, rows: DashboardRow[], signature: string) {
  const clearLeads = database.prepare("DELETE FROM leads");
  const clearSearch = database.prepare("DELETE FROM leads_search");
  const clearMeta = database.prepare("DELETE FROM leads_index_meta");
  const insertLead = database.prepare(`
    INSERT INTO leads (
      id, tab_name, date, brand, campaign, ad_name, form_name, platform, location,
      full_name, phone_number, email, lead_status, is_organic, lead_count, search_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSearch = database.prepare(`
    INSERT INTO leads_search (id, search_text) VALUES (?, ?)
  `);
  const insertMeta = database.prepare(
    "INSERT INTO leads_index_meta (key, value) VALUES (?, ?)",
  );

  database.exec("BEGIN");

  try {
    clearLeads.run();
    clearSearch.run();
    clearMeta.run();

    for (const row of rows) {
      const searchText = buildLeadsSearchText(row);

      insertLead.run(
        row.id,
        row.tabName,
        row.date ?? "",
        row.brand,
        row.campaign,
        row.adName,
        row.formName,
        row.platform,
        row.location,
        row.fullName,
        row.phoneNumber,
        row.email,
        row.leadStatus,
        row.isOrganic ? 1 : 0,
        row.leadCount,
        searchText,
      );
      insertSearch.run(row.id, searchText);
    }

    insertMeta.run("schemaVersion", LEADS_INDEX_SCHEMA_VERSION);
    insertMeta.run("signature", signature);
    insertMeta.run("rowCount", String(rows.length));
    insertMeta.run("updatedAt", new Date().toISOString());

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

async function ensureLeadsIndexReady() {
  await ensureLeadsIndexDirectory();

  const { error, rows, signature } = await getLeadsIndexSource();
  const database = await openLeadsIndexDatabase();

  try {
    const currentMetaRows = database
      .prepare("SELECT key, value FROM leads_index_meta")
      .all() as Array<{ key?: string; value?: string }>;
    const currentMeta = new Map(
      currentMetaRows.map((row) => [row.key ?? "", row.value ?? ""]),
    );
    const currentSignature = currentMeta.get("signature");
    const currentSchemaVersion = currentMeta.get("schemaVersion");

    if (currentSignature !== signature || currentSchemaVersion !== LEADS_INDEX_SCHEMA_VERSION) {
      rebuildLeadsIndex(database, rows, signature);
    }

    return { database, error };
  } catch (indexError) {
    database.close();
    throw indexError;
  }
}

function normalizeLeadsQuery(query: Partial<LeadsPageQuery>): LeadsPageQuery {
  const safePage = Number.isFinite(query.page) ? Math.max(1, Number(query.page)) : 1;
  const safeSort = query.sort === "asc" ? "asc" : "desc";

  return {
    brand: query.brand === "redwing" ? "redwing" : "bigwing",
    campaigns: Array.from(new Set((query.campaigns ?? []).map((value) => value.trim()).filter(Boolean))),
    from:
      typeof query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.from)
        ? query.from
        : null,
    page: safePage,
    q: typeof query.q === "string" ? query.q.trim() : "",
    sort: safeSort,
    to:
      typeof query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.to)
        ? query.to
        : null,
  };
}

function buildLeadsWhereClause(query: LeadsPageQuery) {
  const joins: string[] = [];
  const clauses = ["leads.brand = ?"];
  const params: Array<string | number> = [query.brand];

  if (query.campaigns.length > 0) {
    clauses.push(`leads.campaign IN (${query.campaigns.map(() => "?").join(", ")})`);
    params.push(...query.campaigns);
  }

  if (query.from) {
    clauses.push("leads.date >= ?");
    params.push(query.from);
  }

  if (query.to) {
    clauses.push("leads.date <= ?");
    params.push(query.to);
  }

  const searchMatch = query.q
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((token) => `${token}*`)
    .join(" AND ");

  if (searchMatch) {
    joins.push("INNER JOIN leads_search ON leads_search.id = leads.id");
    clauses.push("leads_search.search_text MATCH ?");
    params.push(searchMatch);
  }

  return {
    fromSql: `FROM leads ${joins.join(" ")}`.trim(),
    params,
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
  };
}

function mapLeadsIndexRow(row: LeadsIndexRow): LeadsTableRow {
  return {
    adName: row.ad_name,
    brand: row.brand === "redwing" ? "redwing" : row.brand === "bigwing" ? "bigwing" : "unknown",
    campaign: row.campaign,
    date: row.date || null,
    email: row.email,
    formName: row.form_name,
    fullName: row.full_name,
    id: row.id,
    isOrganic: row.is_organic === 1,
    leadCount: Number(row.lead_count ?? 0),
    leadStatus: row.lead_status,
    location: row.location,
    phoneNumber: row.phone_number,
    platform: row.platform,
    raw: {},
    tabName: row.tab_name,
  };
}

async function appendDigitalLeadsToSnapshot(entries: DigitalLeadImportEntry[]) {
  const snapshot = await readWorkbookSnapshot();
  if (!snapshot) return;

  const nextSnapshot: WorkbookSnapshot = {
    ...snapshot,
    generatedAt: new Date().toISOString(),
    digitalLeads: [...snapshot.digitalLeads, ...entries].sort((a, b) => a.date.localeCompare(b.date)),
  };

  await writeWorkbookSnapshot(nextSnapshot);
}

function normalizeRow(
  tabName: string,
  row: Record<string, string>,
  index: number,
  dataSheetConfig: DataSheetConfig,
): DashboardRow {
  const expandedTabName = expandAliases(tabName);
  const canonicalTabName =
    dataSheetConfig.canonicalTabByLookup.get(normalizeLookupKey(expandedTabName)) ?? expandedTabName;
  const campaign = expandAliases(
    getFirstValue(row, ["campaign", "campaign_name", "campaignname"]) || canonicalTabName,
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
  const mappedBrand = dataSheetConfig.brandByTab.get(normalizeLookupKey(expandedTabName));
  const brand = mappedBrand ?? normalizeBrandValue(brandAlias);

  return {
    id: `${tabName}-${index}`,
    tabName: canonicalTabName,
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

function buildRawSheet(title: string, id: number, rows: string[][]) {
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

      return buildRawSheet(title, id, rows);
    }) ?? []
  );
}

async function fetchDataSheet(): Promise<RawSheet | null> {
  const spreadsheetId = getSpreadsheetId();
  const sheets = await getSheetsClient();
  const response = (await Promise.race([
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${DATA_SHEET_TITLE}!A:ZZ`,
      majorDimension: "ROWS",
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Google Sheets request timed out (15s limit). Your data might be too large.")), 15000),
    ),
  ])) as { data: { values?: string[][] } };

  const rows = response.data.values ?? [];
  if (rows.length === 0) {
    return null;
  }

  return buildRawSheet(DATA_SHEET_TITLE, 0, rows);
}

async function fetchIncrementalRawSheets(
  sheetRequests: Array<{ title: string; startRow: number }>,
): Promise<RawSheet[]> {
  if (sheetRequests.length === 0) {
    return [];
  }

  const spreadsheetId = getSpreadsheetId();
  const sheets = await getSheetsClient();
  const ranges = sheetRequests.flatMap(({ title, startRow }) => {
    const escapedTitle = `'${title.replace(/'/g, "''")}'`;
    return [`${escapedTitle}!1:1`, `${escapedTitle}!A${startRow}:ZZ`];
  });

  const values = await Promise.race([
    sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
      majorDimension: "ROWS",
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Google Sheets request timed out (15s limit). Your data might be too large.")), 15000),
    ),
  ]) as unknown as GSheetsResponse;

  const valueRanges = values.data.valueRanges ?? [];

  return sheetRequests.map((sheetRequest, index) => {
    const headerRows = valueRanges[index * 2]?.values ?? [];
    const dataRows = valueRanges[index * 2 + 1]?.values ?? [];
    const headerRow = headerRows[0] ?? [];
    const headers = headerRow.map((header) => normalizeHeader(String(header)));
    const rows = dataRows.map((cells) => {
      const record: Record<string, string> = {};

      headers.forEach((header, cellIndex) => {
        if (!header) return;
        record[header] = String(cells[cellIndex] ?? "").trim();
      });

      return record;
    });

    return {
      id: index,
      title: sheetRequest.title,
      headers,
      rows,
    };
  });
}

/** In-memory TTL cache shared across all requests (30 seconds) */
const CACHE_TTL_MS = 60_000;
const COUNT_CHECK_TTL_MS = 10_000;
const DASHBOARD_CACHE_TTL_MS = 15_000;
let _cachedData: WorkbookData | null = null;
let _cacheTimestamp = 0;
let _inflightPromise: Promise<WorkbookData> | null = null;
let _cachedDashboardData: DashboardData | null = null;
let _dashboardCacheTimestamp = 0;
let _dashboardInflightPromise: Promise<DashboardData> | null = null;
let _cachedCountSignature = "";
let _cachedCountByTab = new Map<string, number>();
let _countCheckTimestamp = 0;
let _countCheckPromise: Promise<LeadCountState> | null = null;

function buildLeadCountState(countByTab: Map<string, number>): LeadCountState {
  const signature = Array.from(countByTab.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tabName, count]) => `${tabName}:${count}`)
    .join("|");

  return { countByTab, signature };
}

async function fetchLeadCountState(): Promise<LeadCountState> {
  const spreadsheetId = getSpreadsheetId();
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${DATA_SHEET_TITLE}!A:E`,
    majorDimension: "ROWS",
  });

  const rows = response.data.values ?? [];
  const headerRow = rows[0] ?? [];
  const headers = headerRow.map((header) => normalizeHeader(String(header)));
  const tabNameIndex = headers.findIndex((header) =>
    ["tab", "tab_name", "sheet", "sheet_name", "campaign_tab"].includes(header),
  );
  const leadCountIndex = headers.findIndex((header) =>
    ["lead_count", "count", "row_count", "total_leads"].includes(header),
  );

  if (tabNameIndex === -1 || leadCountIndex === -1) {
    return { countByTab: new Map(), signature: "" };
  }

  const countByTab = new Map<string, number>();

  rows.slice(1).forEach((cells) => {
    const tabName = expandAliases(String(cells[tabNameIndex] ?? "").trim());
    const leadCount = Number.parseInt(String(cells[leadCountIndex] ?? "").trim(), 10);

    if (tabName && Number.isFinite(leadCount) && leadCount >= 0) {
      countByTab.set(tabName, leadCount);
    }
  });

  return buildLeadCountState(countByTab);
}

async function getFreshLeadCountState(force = false): Promise<LeadCountState> {
  const now = Date.now();

  if (!force && _cachedCountSignature && now - _countCheckTimestamp < COUNT_CHECK_TTL_MS) {
    return {
      countByTab: new Map(_cachedCountByTab),
      signature: _cachedCountSignature,
    };
  }

  if (_countCheckPromise) {
    return _countCheckPromise;
  }

  _countCheckPromise = fetchLeadCountState()
    .then((state) => {
      _cachedCountSignature = state.signature;
      _cachedCountByTab = new Map(state.countByTab);
      _countCheckTimestamp = Date.now();
      _countCheckPromise = null;
      return state;
    })
    .catch((error) => {
      _countCheckPromise = null;
      throw error;
    });

  return _countCheckPromise;
}

async function fetchWorkbookDataInternal(): Promise<WorkbookData> {
  try {
    const rawSheets = await fetchRawSheets();
    const dataSheetConfig = extractDataSheetConfig(rawSheets);
    const snapshot = buildWorkbookSnapshot(rawSheets, dataSheetConfig);
    _cachedCountSignature = dataSheetConfig.leadCountSignature;
    _cachedCountByTab = new Map(dataSheetConfig.leadCountByTab);
    _countCheckTimestamp = Date.now();
    await writeWorkbookSnapshot(snapshot);

    return buildWorkbookDataFromSnapshot(snapshot);
  } catch (error) {
    const spreadsheetId = process.env.SHEET_ID ?? "";
    const defaultTabName = process.env.TAB_NAME ?? "DATA";
    const message =
      error instanceof Error ? error.message : "Unable to read spreadsheet data right now.";

    return {
      sheetId: spreadsheetId,
      defaultTabName,
      tabs: [],
      rows: [],
      digitalLeads: [],
      tabLabels: {},
      leadTableColumns: [],
      error: message,
    };
  }
}

async function fetchDashboardDataInternal(): Promise<DashboardData> {
  try {
    const dataSheet = await fetchDataSheet();
    const dataSheetConfig = extractDataSheetConfig(dataSheet ? [dataSheet] : []);
    const dailySummaries = parseDashboardDailySummaries(dataSheet ?? undefined);
    const digitalLeads = parseDigitalLeadEntries(dataSheet ?? undefined);

    return {
      campaignAliasesByTab: buildCampaignAliasesLookup(dataSheetConfig),
      digitalLeads,
      leadCountByTab: mapToRecord(dataSheetConfig.leadCountByTab),
      redwingLocationLabels: dataSheetConfig.redwingLocationLabels,
      tabs: dataSheetConfig.tabs,
      tabLabels: Object.fromEntries(dataSheetConfig.tabLabels.entries()),
      tabBrandLookup: buildTabBrandLookup(dataSheetConfig),
      dailySummaries,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read dashboard summary data right now.";

    return {
      campaignAliasesByTab: {},
      digitalLeads: [],
      leadCountByTab: {},
      redwingLocationLabels: DEFAULT_REDWING_LOCATION_LABELS,
      tabs: [],
      tabBrandLookup: {},
      tabLabels: {},
      dailySummaries: [],
      error: message,
    };
  }
}

async function refreshSnapshotByAppend(
  snapshot: WorkbookSnapshot,
  leadCountState: LeadCountState,
): Promise<WorkbookSnapshot | null> {
  const changedTabs: string[] = [];
  const previousCountByTab = recordToMap(snapshot.leadCountByTab);

  for (const [tabName, nextCount] of leadCountState.countByTab.entries()) {
    const previousCount = previousCountByTab.get(tabName) ?? snapshot.rowsByTab[tabName]?.length;
    const sheetTitle = snapshot.sheetTitleByTab[tabName];

    if (previousCount === undefined || !sheetTitle) {
      return null;
    }

    if (nextCount < previousCount) {
      return null;
    }

    if (nextCount > previousCount) {
      changedTabs.push(tabName);
    }
  }

  for (const tabName of Object.keys(snapshot.rowsByTab)) {
    if (!leadCountState.countByTab.has(tabName)) {
      return null;
    }
  }

  if (changedTabs.length === 0) {
    return {
      ...snapshot,
      generatedAt: new Date().toISOString(),
      leadCountSignature: leadCountState.signature,
      leadCountByTab: mapToRecord(leadCountState.countByTab),
    };
  }

  const dataSheetConfig: DataSheetConfig = {
    brandByTab: recordToMap(snapshot.brandByTab),
    campaignAliasesByTab: new Map(),
    canonicalTabByLookup: recordToMap(snapshot.canonicalTabByLookup),
    tabLabels: recordToMap(snapshot.tabLabels),
    leadTableColumns: snapshot.leadTableColumns,
    leadCountByTab: leadCountState.countByTab,
    leadCountSignature: leadCountState.signature,
    redwingLocationLabels: DEFAULT_REDWING_LOCATION_LABELS,
    tabs: snapshot.tabs,
  };
  const incrementalSheets = await fetchIncrementalRawSheets(
    changedTabs.map((tabName) => ({
      title: snapshot.sheetTitleByTab[tabName],
      startRow: (snapshot.rowsByTab[tabName]?.length ?? 0) + 2,
    })),
  );
  const nextRowsByTab = { ...snapshot.rowsByTab };

  incrementalSheets.forEach((sheet) => {
    const expandedTabName = expandAliases(sheet.title);
    const existingRows = nextRowsByTab[expandedTabName] ?? [];
    const appendedRows = sheet.rows
      .filter((row) => Object.values(row).some(Boolean))
      .map((row, index) => normalizeRow(sheet.title, row, existingRows.length + index, dataSheetConfig));

    nextRowsByTab[expandedTabName] = [...existingRows, ...appendedRows];
  });

  for (const tabName of changedTabs) {
    const expectedCount = leadCountState.countByTab.get(tabName);
    const actualCount = nextRowsByTab[tabName]?.length ?? 0;

    if (expectedCount === undefined || actualCount !== expectedCount) {
      return null;
    }
  }

  return {
    ...snapshot,
    generatedAt: new Date().toISOString(),
    leadCountSignature: leadCountState.signature,
    leadCountByTab: mapToRecord(leadCountState.countByTab),
    rowsByTab: nextRowsByTab,
  };
}

function clearWorkbookCacheState() {
  _cachedData = null;
  _cacheTimestamp = 0;
  _inflightPromise = null;
  _cachedCountSignature = "";
  _cachedCountByTab = new Map();
  _countCheckTimestamp = 0;
  _countCheckPromise = null;
}

function clearDashboardCacheState() {
  _cachedDashboardData = null;
  _dashboardCacheTimestamp = 0;
  _dashboardInflightPromise = null;
}

export async function refreshWorkbookData(): Promise<WorkbookData> {
  clearWorkbookCacheState();
  clearDashboardCacheState();

  const data = await fetchWorkbookDataInternal();
  _cachedData = data;
  _cacheTimestamp = Date.now();

  return data;
}

export async function getWorkbookData(): Promise<WorkbookData> {
  const now = Date.now();
  const cachedData = _cachedData;

  // Return cached data if still fresh
  if (cachedData && now - _cacheTimestamp < CACHE_TTL_MS) {
    const snapshotTimestamp = await getWorkbookSnapshotTimestamp();

    if (snapshotTimestamp > _cacheTimestamp) {
      _cachedData = null;
      _cacheTimestamp = 0;
    } else {
      try {
        const latestLeadCountState = await getFreshLeadCountState();
        if (latestLeadCountState.signature === _cachedCountSignature) {
          return cachedData;
        }

        _cachedData = null;
        _cacheTimestamp = 0;
      } catch {
        return cachedData;
      }
    }
  }

  // If another request is already fetching, wait for it (dedup concurrent calls)
  if (_inflightPromise) {
    return _inflightPromise;
  }

  _inflightPromise = (async () => {
    const snapshot = await readWorkbookSnapshot();

    if (snapshot) {
      try {
        const latestLeadCountState = await getFreshLeadCountState();

        if (snapshot.leadCountSignature === latestLeadCountState.signature) {
          const data = buildWorkbookDataFromSnapshot(snapshot);
          _cachedData = data;
          _cacheTimestamp = Date.now();
          return data;
        }

        const nextSnapshot = await refreshSnapshotByAppend(snapshot, latestLeadCountState);
        if (nextSnapshot) {
          await writeWorkbookSnapshot(nextSnapshot);
          _cachedCountSignature = nextSnapshot.leadCountSignature;
          _cachedCountByTab = recordToMap(nextSnapshot.leadCountByTab);
          _countCheckTimestamp = Date.now();

          const data = buildWorkbookDataFromSnapshot(nextSnapshot);
          _cachedData = data;
          _cacheTimestamp = Date.now();
          return data;
        }
      } catch {
        const data = buildWorkbookDataFromSnapshot(snapshot);
        _cachedData = data;
        _cacheTimestamp = Date.now();
        return data;
      }
    }

    const data = await fetchWorkbookDataInternal();
    _cachedData = data;
    _cacheTimestamp = Date.now();
    return data;
  })()
    .finally(() => {
      _inflightPromise = null;
    });

  return _inflightPromise;
}

export async function refreshDashboardData(): Promise<DashboardData> {
  clearDashboardCacheState();

  const data = await fetchDashboardDataInternal();
  _cachedDashboardData = data;
  _dashboardCacheTimestamp = Date.now();

  return data;
}

export async function getDashboardData(): Promise<DashboardData> {
  const now = Date.now();
  const cachedDashboardData = _cachedDashboardData;

  if (cachedDashboardData && now - _dashboardCacheTimestamp < DASHBOARD_CACHE_TTL_MS) {
    return cachedDashboardData;
  }

  if (_dashboardInflightPromise) {
    return _dashboardInflightPromise;
  }

  _dashboardInflightPromise = (async () => {
    const data = await fetchDashboardDataInternal();
    _cachedDashboardData = data;
    _dashboardCacheTimestamp = Date.now();
    return data;
  })().finally(() => {
    _dashboardInflightPromise = null;
  });

  return _dashboardInflightPromise;
}

export async function getLeadsPageData(
  query: Partial<LeadsPageQuery>,
): Promise<LeadsPageData> {
  const normalizedQuery = normalizeLeadsQuery(query);

  try {
    const { database, error } = await ensureLeadsIndexReady();

    try {
      const campaignRows = database
        .prepare(
          "SELECT DISTINCT campaign FROM leads WHERE brand = ? AND campaign != '' ORDER BY campaign COLLATE NOCASE ASC",
        )
        .all(normalizedQuery.brand) as Array<{ campaign?: string }>;
      const campaignOptions = campaignRows
        .map((row) => row.campaign?.trim() ?? "")
        .filter(Boolean);
      const validCampaigns = normalizedQuery.campaigns.filter((campaign) =>
        campaignOptions.includes(campaign),
      );
      const effectiveQuery =
        validCampaigns.length === normalizedQuery.campaigns.length
          ? normalizedQuery
          : { ...normalizedQuery, campaigns: validCampaigns };
      const queryParts = buildLeadsWhereClause(effectiveQuery);
      const totalRow = database
        .prepare(`SELECT COUNT(*) as total ${queryParts.fromSql} ${queryParts.whereSql}`)
        .get(...queryParts.params) as { total?: number } | undefined;
      const total = Number(totalRow?.total ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE));
      const page = Math.min(effectiveQuery.page, totalPages);
      const offset = (page - 1) * LEADS_PAGE_SIZE;
      const orderBy = effectiveQuery.sort === "asc" ? "ASC" : "DESC";
      const rows = database
        .prepare(`
          SELECT
            leads.id, leads.tab_name, leads.date, leads.brand, leads.campaign,
            leads.ad_name, leads.form_name, leads.platform, leads.location,
            leads.full_name, leads.phone_number, leads.email,
            leads.lead_status, leads.is_organic, leads.lead_count
          ${queryParts.fromSql}
          ${queryParts.whereSql}
          ORDER BY leads.date ${orderBy}, leads.id ${orderBy}
          LIMIT ? OFFSET ?
        `)
        .all(
          ...queryParts.params,
          LEADS_PAGE_SIZE,
          offset,
        ) as LeadsIndexRow[];

      return {
        campaignOptions,
        error,
        page,
        pageSize: LEADS_PAGE_SIZE,
        rows: rows.map((row) => mapLeadsIndexRow(row)),
        total,
        totalPages,
      };
    } finally {
      database.close();
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to query the leads index right now.";

    return {
      campaignOptions: [],
      error: message,
      page: 1,
      pageSize: LEADS_PAGE_SIZE,
      rows: [],
      total: 0,
      totalPages: 1,
    };
  }
}

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
  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: DIGITAL_DATA_HEADER_RANGE,
  });
  const existingHeaders = (headerResponse.data.values?.[0] ?? []).map((value) => String(value).trim());
  const expectedHeaders = [...DIGITAL_DATA_HEADERS];
  const headersMatch =
    existingHeaders.length === expectedHeaders.length &&
    existingHeaders.every((header, index) => header === expectedHeaders[index]);

  if (!headersMatch) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: DIGITAL_DATA_HEADER_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [expectedHeaders],
      },
    });
  }

  return expectedHeaders;
}

async function getNextDigitalDataRow() {
  const sheets = await getSheetsClient(["https://www.googleapis.com/auth/spreadsheets.readonly"]);
  const spreadsheetId = getSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: DIGITAL_DATA_APPEND_RANGE,
    majorDimension: "ROWS",
  });
  const rows = response.data.values ?? [];
  let lastUsedRow = 1;

  rows.forEach((row, index) => {
    if (row.some((value) => String(value ?? "").trim() !== "")) {
      lastUsedRow = index + 1;
    }
  });

  return Math.max(lastUsedRow + 1, 2);
}

export async function appendDigitalLeadImport(
  entries: DigitalLeadImportEntry[],
  promptUsed: string,
) {
  if (entries.length === 0) {
    throw new Error("At least one entry is required.");
  }

  await ensureDataSheetHeaders();
  const sheets = await getSheetsClient(["https://www.googleapis.com/auth/spreadsheets"]);
  const spreadsheetId = getSpreadsheetId();
  const importedAt = new Date().toISOString();
  const startRow = await getNextDigitalDataRow();

  const values = entries.map((entry) => [
    DIGITAL_REPORT_TYPE,
    "redwing",
    normalizeDigitalDate(entry.date),
    normalizeDigitalMetric(entry.actual),
    normalizeDigitalMetric(entry.contacted),
    normalizeDigitalMetric(entry.nonContacted),
    normalizeDigitalMetric(entry.interested),
    promptUsed,
    importedAt,
  ]);

  const endRow = startRow + values.length - 1;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${DATA_SHEET_TITLE}!F${startRow}:N${endRow}`,
    valueInputOption: "RAW",
    requestBody: {
      values,
    },
  });

  await appendDigitalLeadsToSnapshot(entries);
  _cachedData = null;
  _cacheTimestamp = 0;
  clearDashboardCacheState();
}
