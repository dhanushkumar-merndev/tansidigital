import { existsSync } from "node:fs";
import { join } from "node:path";

import type { SKRSContext2D } from "@napi-rs/canvas";

import { type Brand } from "./brands";
import { fetchMetaCampaignSpend, isMetaInsightsConfigured } from "./meta";
import { getDashboardData } from "./sheets";
import { sendTelegramTextMessage } from "./telegram";

type BrandReport = {
  brand: Brand;
  columns: Array<{
    brand: "bigwing" | "redwing";
    label: string;
    tab: string;
  }>;
  rows: Array<{
    dateKey: string;
    label: string;
    values: number[];
  }>;
  totals: number[];
  totalLeads: number;
  fromDateKey: string | null;
  toDateKey: string | null;
};

type RequestedCampaign = {
  aliasKeys: string[];
  key: string;
};

const REPORT_FONT_FAMILY = "Digital Leads Report Sans";
const REPORT_FONT_PATHS = [
  join(/*turbopackIgnore: true*/ process.cwd(), "netlify", "font", "Avenir LT Std 55 Roman.otf"),
  join(/*turbopackIgnore: true*/ process.cwd(), "netlify", "font", "report-font.ttf"),
  join(/*turbopackIgnore: true*/ process.cwd(), "netlify", "fonts", "report-font.ttf"),
  join(/*turbopackIgnore: true*/ process.cwd(), "netlify", "fonts", "DigitalLeads.ttf"),
  join(/*turbopackIgnore: true*/ process.cwd(), "public", "fonts", "report-font.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
];

let resolvedReportFontFamily = "sans-serif";
let hasAttemptedReportFontRegistration = false;

async function getReportFontFamily() {
  if (hasAttemptedReportFontRegistration) {
    return resolvedReportFontFamily;
  }

  hasAttemptedReportFontRegistration = true;

  const { GlobalFonts } = await import("@napi-rs/canvas");

  for (const fontPath of REPORT_FONT_PATHS) {
    if (!existsSync(fontPath)) {
      continue;
    }

    try {
      const fontKey = GlobalFonts.registerFromPath(fontPath, REPORT_FONT_FAMILY);

      if (fontKey) {
        resolvedReportFontFamily = `"${REPORT_FONT_FAMILY}"`;
        return resolvedReportFontFamily;
      }
    } catch (error) {
      console.warn("[daily-telegram-report] Failed to register report font.", {
        error: error instanceof Error ? error.message : String(error),
        fontPath,
      });
    }
  }

  console.warn("[daily-telegram-report] No server font was registered. Falling back to sans-serif.");
  return resolvedReportFontFamily;
}

function getIstDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatIstDate(dateKey: string) {
  const parsedDate = new Date(`${dateKey}T00:00:00`);

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(parsedDate);
}

function formatExportDateLabel(dateKey: string) {
  return formatIstDate(dateKey);
}

function normalizeCampaignKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildRequestedCampaigns(
  dashboard: Awaited<ReturnType<typeof getDashboardData>>,
) {
  const requestedCampaigns: RequestedCampaign[] = [];
  const seen = new Set<string>();

  for (const tab of dashboard.tabs) {
    const aliases = Array.from(
      new Set([tab, ...(dashboard.campaignAliasesByTab[tab] ?? [])]),
    );
    const aliasKeys = aliases.map((alias) => normalizeCampaignKey(alias)).filter(Boolean);
    const key = normalizeCampaignKey(tab);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    requestedCampaigns.push({ aliasKeys, key });
  }

  return requestedCampaigns;
}

function findBestCampaignMatch(
  requestedCampaigns: RequestedCampaign[],
  campaignName: string,
) {
  const normalizedCampaignName = normalizeCampaignKey(campaignName);
  const exactMatch = requestedCampaigns.find((campaign) =>
    campaign.aliasKeys.includes(normalizedCampaignName),
  );

  if (exactMatch) {
    return exactMatch;
  }

  const cleanedCampaignName = normalizedCampaignName
    .replace(/[-_:.\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cleanedExactMatch = requestedCampaigns.find((campaign) =>
    campaign.aliasKeys.some((alias) => {
      const cleanedAlias = alias
        .replace(/[-_:.\|]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return cleanedAlias === cleanedCampaignName;
    }),
  );

  if (cleanedExactMatch) {
    return cleanedExactMatch;
  }

  return requestedCampaigns
    .filter((campaign) =>
      campaign.aliasKeys.some(
        (aliasKey) =>
          normalizedCampaignName.includes(aliasKey) ||
          aliasKey.includes(normalizedCampaignName),
      ),
    )
    .sort((left, right) => {
      const longestLeft = Math.max(...left.aliasKeys.map((key) => key.length));
      const longestRight = Math.max(...right.aliasKeys.map((key) => key.length));
      return longestRight - longestLeft;
    })[0] ?? null;
}

function getCurrentMonthReportDateKeys(today = new Date()) {
  const todayKey = getIstDateKey(today);
  const allDateKeys: string[] = [];
  const istYear = Number(todayKey.substring(0, 4));
  const istMonth = Number(todayKey.substring(5, 7)) - 1;
  const cursor = new Date(istYear, istMonth, 1);

  while (true) {
    const cursorKey = getIstDateKey(cursor);
    if (cursorKey >= todayKey) break;
    allDateKeys.push(cursorKey);
    cursor.setDate(cursor.getDate() + 1);
  }

  return allDateKeys;
}

async function getTakingCampaignTabs(
  dashboard: Awaited<ReturnType<typeof getDashboardData>>,
  fromDateKey: string | null,
  toDateKey: string | null,
) {
  if (!fromDateKey || !toDateKey || !isMetaInsightsConfigured()) {
    return null;
  }

  const requestedCampaigns = buildRequestedCampaigns(dashboard);
  const spendRows = await fetchMetaCampaignSpend({
    from: fromDateKey,
    to: toDateKey,
  });
  const takingCampaignTabs = new Set<string>();

  for (const row of spendRows) {
    if (!row.campaignName) {
      continue;
    }

    const matchedCampaign = findBestCampaignMatch(
      requestedCampaigns,
      row.campaignName,
    );

    if (matchedCampaign) {
      takingCampaignTabs.add(matchedCampaign.key);
    }
  }

  return takingCampaignTabs;
}

function buildBrandReport(
  brand: Brand,
  dashboard: Awaited<ReturnType<typeof getDashboardData>>,
  takingCampaignTabs: Set<string> | null,
  reportDateKeys: string[],
): BrandReport {
  const relevantTabs =
    brand === "all"
      ? [
          ...dashboard.tabs.filter((tab) => dashboard.tabBrandLookup[tab] === "bigwing"),
          ...dashboard.tabs.filter((tab) => dashboard.tabBrandLookup[tab] === "redwing"),
        ]
      : dashboard.tabs.filter((tab) => dashboard.tabBrandLookup[tab] === brand);
  const exportTabs = relevantTabs.filter(
    (tab) => !takingCampaignTabs || takingCampaignTabs.has(normalizeCampaignKey(tab)),
  );
  const columns = exportTabs.map((tab) => ({
    brand: dashboard.tabBrandLookup[tab] === "bigwing" ? ("bigwing" as const) : ("redwing" as const),
    label: dashboard.tabLabels[tab] || tab,
    tab,
  }));
  const todayKey = getIstDateKey(reportDateKeys[reportDateKeys.length - 1] ? new Date(reportDateKeys[reportDateKeys.length - 1]) : new Date());
  const currentMonthPrefix = todayKey.substring(0, 8); // "YYYY-MM-"

  // Build a lookup of existing summaries for this month
  const summariesByDate = new Map(
    dashboard.dailySummaries
      .filter((summary) => summary.date.startsWith(currentMonthPrefix) && summary.date !== todayKey)
      .map((summary) => [summary.date, summary] as const),
  );

  const rows = reportDateKeys.map((dateKey) => {
    const summary = summariesByDate.get(dateKey);
    return {
      dateKey,
      label: formatExportDateLabel(dateKey),
      values: columns.map((column) => summary?.leadCountsByTab[column.tab] ?? 0),
    };
  });
  const totals = columns.map((_, columnIndex) =>
    rows.reduce((total, row) => total + (row.values[columnIndex] ?? 0), 0),
  );

  return {
    brand,
    columns,
    rows,
    totals,
    totalLeads: totals.reduce((total, value) => total + value, 0),
    fromDateKey: rows[0]?.dateKey ?? null,
    toDateKey: rows[rows.length - 1]?.dateKey ?? null,
  };
}

function wrapCanvasText(
  context: SKRSContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let currentLine = words[0] ?? "";

  for (const word of words.slice(1)) {
    const nextLine = `${currentLine} ${word}`;
    if (context.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  lines.push(currentLine);
  return lines;
}

async function createReportImage(report: BrandReport) {
  const fontFamily = await getReportFontFamily();
  const { createCanvas } = await import("@napi-rs/canvas");
  const isBigwingTheme = report.brand === "bigwing";
  const background = isBigwingTheme ? "#050505" : "#0D4D8B";
  const panelStrong = isBigwingTheme
    ? "rgba(255,255,255,0.12)"
    : "rgba(255,255,255,0.14)";
  const panelSoft = isBigwingTheme
    ? "rgba(255,255,255,0.08)"
    : "rgba(255,255,255,0.12)";
  const rowEven = isBigwingTheme ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.05)";
  const rowOdd = isBigwingTheme ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.03)";
  const border = "rgba(255,255,255,0.18)";

  const scale = 3;
  const paddingX = Math.round(44 * scale);
  const paddingY = Math.round(38 * scale);
  const titleHeight = Math.round(56 * scale);
  const groupRowHeight = Math.round(42 * scale);
  const headerRowHeight = Math.round(64 * scale);
  const bodyRowHeight = Math.round(42 * scale);
  const totalRowHeight = Math.round(46 * scale);
  const leadTotalRowHeight = totalRowHeight;
  const dateColumnWidth = Math.round(144 * scale);
  const campaignColumnWidth = Math.round(156 * scale);
  const tableWidth = dateColumnWidth + report.columns.length * campaignColumnWidth;
  const width = paddingX * 2 + tableWidth;
  const height =
    paddingY * 2 +
    titleHeight +
    groupRowHeight +
    headerRowHeight +
    Math.max(report.rows.length, 1) * bodyRowHeight +
    totalRowHeight +
    leadTotalRowHeight;

  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const left = paddingX;
  let cursorY = paddingY;

  context.fillStyle = "#FFFFFF";
  context.font = `700 ${Math.round(34 * scale)}px ${fontFamily}`;
  context.fillText("Digital Leads", left, cursorY + Math.round(34 * scale));

  cursorY += titleHeight;

  const bigwingColumns = report.columns.filter((column) => column.brand === "bigwing");
  const redwingColumns = report.columns.filter((column) => column.brand === "redwing");

  context.fillStyle = panelSoft;
  context.fillRect(left, cursorY, dateColumnWidth, groupRowHeight);

  let groupStartX = left + dateColumnWidth;
  const brandGroups = [
    { columns: bigwingColumns, label: "BigWing" },
    { columns: redwingColumns, label: "RedWing" },
  ].filter((group) => group.columns.length > 0);

  for (const group of brandGroups) {
    const groupWidth = group.columns.length * campaignColumnWidth;
    context.fillStyle = panelSoft;
    context.fillRect(groupStartX, cursorY, groupWidth, groupRowHeight);
    context.strokeStyle = border;
    context.strokeRect(groupStartX, cursorY, groupWidth, groupRowHeight);
    context.fillStyle = "#FFFFFF";
    context.font = `700 ${Math.round(14 * scale)}px ${fontFamily}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(
      group.label,
      groupStartX + groupWidth / 2,
      cursorY + groupRowHeight / 2,
    );
    groupStartX += groupWidth;
  }

  cursorY += groupRowHeight;

  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillStyle = panelStrong;
  context.fillRect(left, cursorY, dateColumnWidth, headerRowHeight);
  context.strokeStyle = border;
  context.strokeRect(left, cursorY, dateColumnWidth, headerRowHeight);
  context.fillStyle = "#FFFFFF";
  context.font = `700 ${Math.round(14 * scale)}px ${fontFamily}`;
  context.fillText("Date", left + Math.round(16 * scale), cursorY + headerRowHeight / 2);

  report.columns.forEach((column, index) => {
    const cellX = left + dateColumnWidth + index * campaignColumnWidth;
    context.fillStyle = panelStrong;
    context.fillRect(cellX, cursorY, campaignColumnWidth, headerRowHeight);
    context.strokeStyle = border;
    context.strokeRect(cellX, cursorY, campaignColumnWidth, headerRowHeight);
    context.fillStyle = "#FFFFFF";
    context.font = `700 ${Math.round(13 * scale)}px ${fontFamily}`;
    const lines = wrapCanvasText(
      context,
      column.label,
      campaignColumnWidth - Math.round(20 * scale),
    ).slice(0, 3);
    const lineHeight = Math.round(15 * scale);
    const textTop =
      cursorY +
      headerRowHeight / 2 -
      ((lines.length - 1) * lineHeight) / 2;

    lines.forEach((line, lineIndex) => {
      context.fillText(
        line,
        cellX + Math.round(10 * scale),
        textTop + lineIndex * lineHeight,
      );
    });
  });

  cursorY += headerRowHeight;

  const rows = report.rows.length > 0
    ? report.rows
    : [{ dateKey: "no-data", label: "No historical data", values: report.columns.map(() => 0) }];

  rows.forEach((row, rowIndex) => {
    const rowY = cursorY + rowIndex * bodyRowHeight;
    const fill = rowIndex % 2 === 0 ? rowEven : rowOdd;

    context.fillStyle = fill;
    context.fillRect(left, rowY, dateColumnWidth, bodyRowHeight);
    context.strokeStyle = border;
    context.strokeRect(left, rowY, dateColumnWidth, bodyRowHeight);
    context.fillStyle = "#FFFFFF";
    context.font = `600 ${Math.round(13 * scale)}px ${fontFamily}`;
    context.textAlign = "left";
    context.fillText(
      row.label,
      left + Math.round(16 * scale),
      rowY + bodyRowHeight / 2,
    );

    row.values.forEach((value, valueIndex) => {
      const cellX = left + dateColumnWidth + valueIndex * campaignColumnWidth;
      context.fillStyle = fill;
      context.fillRect(cellX, rowY, campaignColumnWidth, bodyRowHeight);
      context.strokeStyle = border;
      context.strokeRect(cellX, rowY, campaignColumnWidth, bodyRowHeight);
      context.fillStyle = "#FFFFFF";
      context.font = `600 ${Math.round(13 * scale)}px ${fontFamily}`;
      context.textAlign = "center";
      context.fillText(
        value === 0 ? "-" : String(value),
        cellX + campaignColumnWidth / 2,
        rowY + bodyRowHeight / 2,
      );
    });
  });

  cursorY += rows.length * bodyRowHeight;

  context.textAlign = "left";
  context.fillStyle = panelStrong;
  context.fillRect(left, cursorY, dateColumnWidth, totalRowHeight);
  context.strokeStyle = border;
  context.strokeRect(left, cursorY, dateColumnWidth, totalRowHeight);
  context.fillStyle = "#FFFFFF";
  context.font = `700 ${Math.round(14 * scale)}px ${fontFamily}`;
  context.fillText(
    "Total",
    left + Math.round(16 * scale),
    cursorY + totalRowHeight / 2,
  );

  report.totals.forEach((value, index) => {
    const cellX = left + dateColumnWidth + index * campaignColumnWidth;
    context.fillStyle = panelStrong;
    context.fillRect(cellX, cursorY, campaignColumnWidth, totalRowHeight);
    context.strokeStyle = border;
    context.strokeRect(cellX, cursorY, campaignColumnWidth, totalRowHeight);
    context.fillStyle = "#FFFFFF";
    context.font = `700 ${Math.round(14 * scale)}px ${fontFamily}`;
    context.textAlign = "center";
    context.fillText(
      value === 0 ? "-" : String(value),
      cellX + campaignColumnWidth / 2,
      cursorY + totalRowHeight / 2,
    );
  });

  cursorY += totalRowHeight;

  const bigwingLeadTotal = report.totals.reduce(
    (total, value, index) =>
      report.columns[index]?.brand === "bigwing" ? total + value : total,
    0,
  );
  const redwingLeadTotal = report.totals.reduce(
    (total, value, index) =>
      report.columns[index]?.brand === "redwing" ? total + value : total,
    0,
  );
  const allLeadTotal = bigwingLeadTotal + redwingLeadTotal;

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = panelSoft;
  context.fillRect(left, cursorY, dateColumnWidth, leadTotalRowHeight);
  context.strokeStyle = border;
  context.strokeRect(left, cursorY, dateColumnWidth, leadTotalRowHeight);
  context.fillStyle = "#FFFFFF";
  context.font = `700 ${Math.round(14 * scale)}px ${fontFamily}`;
  context.fillText(
    String(allLeadTotal),
    left + dateColumnWidth / 2,
    cursorY + leadTotalRowHeight / 2,
  );

  let leadTotalStartX = left + dateColumnWidth;
  for (const group of brandGroups) {
    const groupWidth = group.columns.length * campaignColumnWidth;
    const groupTotal = group.label === "BigWing" ? bigwingLeadTotal : redwingLeadTotal;

    context.fillStyle = panelSoft;
    context.fillRect(leadTotalStartX, cursorY, groupWidth, leadTotalRowHeight);
    context.strokeStyle = border;
    context.strokeRect(leadTotalStartX, cursorY, groupWidth, leadTotalRowHeight);
    context.textAlign = "center";
    context.fillStyle = "#FFFFFF";
    context.font = `700 ${Math.round(14 * scale)}px ${fontFamily}`;
    context.fillText(
      String(groupTotal),
      leadTotalStartX + groupWidth / 2,
      cursorY + leadTotalRowHeight / 2,
    );
    leadTotalStartX += groupWidth;
  }

  return canvas.encode("png");
}

export async function createCombinedDailyReportImage(today = new Date()) {
  const dashboard = await getDashboardData();
  const reportDateKeys = getCurrentMonthReportDateKeys(today);
  const takingCampaignTabs = await getTakingCampaignTabs(
    dashboard,
    reportDateKeys[0] ?? null,
    reportDateKeys[reportDateKeys.length - 1] ?? null,
  );
  const report = buildBrandReport("all", dashboard, takingCampaignTabs, reportDateKeys);

  return createReportImage(report);
}

export async function sendDailyTelegramReports() {
  await sendTelegramTextMessage(
    [
      "Digital Leads Report",
      "Telegram image delivery is disabled.",
      "Daily reports are uploaded to Google Drive by the daily-report function.",
    ].join("\n"),
  );
}
