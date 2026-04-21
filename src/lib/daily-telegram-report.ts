import { existsSync } from "node:fs";

import { GlobalFonts, createCanvas, type SKRSContext2D } from "@napi-rs/canvas";

import { BRAND_CONFIG, type Brand } from "./brands";
import { getDashboardData } from "./sheets";
import { sendTelegramDocument, sendTelegramTextMessage } from "./telegram";

type BrandReport = {
  brand: Brand;
  campaignRows: Array<{ label: string; leads: number }>;
  totalLeads: number;
};

const REPORT_FONT_FAMILY = "Digital Leads Report Sans";
const REPORT_FONT_PATHS = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
];

let resolvedReportFontFamily = "sans-serif";
let hasAttemptedReportFontRegistration = false;

function getReportFontFamily() {
  if (hasAttemptedReportFontRegistration) {
    return resolvedReportFontFamily;
  }

  hasAttemptedReportFontRegistration = true;

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

function getReportTimeLabel() {
  return process.env.TELEGRAM_DAILY_REPORT_TIME_IST?.trim() || "20:00";
}

function getBrandHeading(brand: Brand) {
  if (brand === "all") {
    return "Combined";
  }

  return BRAND_CONFIG[brand].label;
}

function buildBrandReport(
  brand: Brand,
  todaySummary: Awaited<ReturnType<typeof getDashboardData>>["dailySummaries"][number],
  dashboard: Awaited<ReturnType<typeof getDashboardData>>,
): BrandReport {
  const relevantTabs =
    brand === "all"
      ? dashboard.tabs
      : dashboard.tabs.filter((tab) => dashboard.tabBrandLookup[tab] === brand);

  const campaignRows = relevantTabs
    .map((tab) => ({
      label: dashboard.tabLabels[tab] || tab,
      leads: todaySummary.leadCountsByTab[tab] ?? 0,
    }))
    .sort((left, right) => right.leads - left.leads || left.label.localeCompare(right.label));

  return {
    brand,
    campaignRows,
    totalLeads: campaignRows.reduce((total, row) => total + row.leads, 0),
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

function createReportImage(report: BrandReport, dateKey: string) {
  const fontFamily = getReportFontFamily();
  const isBigwingTheme = report.brand === "bigwing";
  const background = isBigwingTheme ? "#050505" : "#0D4D8B";
  const panel = isBigwingTheme ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.12)";
  const panelStrong = isBigwingTheme
    ? "rgba(255,255,255,0.13)"
    : "rgba(255,255,255,0.16)";
  const rowEven = isBigwingTheme ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.05)";
  const rowOdd = isBigwingTheme ? "rgba(255,255,255,0.028)" : "rgba(255,255,255,0.035)";
  const border = "rgba(255,255,255,0.18)";

  const scale = 2.2;
  const width = Math.round(1080 * scale);
  const padding = Math.round(34 * scale);
  const headerHeight = Math.round(136 * scale);
  const summaryHeight = Math.round(84 * scale);
  const tableHeaderHeight = Math.round(58 * scale);
  const rowHeight = Math.round(44 * scale);
  const footerHeight = Math.round(52 * scale);
  const maxRows = Math.max(report.campaignRows.length, 1);
  const height =
    padding * 2 +
    headerHeight +
    summaryHeight +
    tableHeaderHeight +
    maxRows * rowHeight +
    footerHeight;

  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  let cursorY = padding;

  context.fillStyle = "#FFFFFF";
  context.font = `700 ${Math.round(34 * scale)}px ${fontFamily}`;
  context.fillText("Digital Leads", padding, cursorY + Math.round(34 * scale));

  context.fillStyle = "rgba(255,255,255,0.72)";
  context.font = `500 ${Math.round(17 * scale)}px ${fontFamily}`;
  context.fillText(
    `${getBrandHeading(report.brand)} • ${formatIstDate(dateKey)} • ${getReportTimeLabel()} IST`,
    padding,
    cursorY + Math.round(70 * scale),
  );

  context.fillStyle = panel;
  context.fillRect(padding, cursorY + Math.round(92 * scale), width - padding * 2, summaryHeight);
  context.strokeStyle = border;
  context.strokeRect(padding, cursorY + Math.round(92 * scale), width - padding * 2, summaryHeight);
  context.fillStyle = "#FFFFFF";
  context.font = `700 ${Math.round(20 * scale)}px ${fontFamily}`;
  context.fillText(
    `Total Leads: ${report.totalLeads}`,
    padding + Math.round(20 * scale),
    cursorY + Math.round(142 * scale),
  );

  cursorY += headerHeight + summaryHeight;

  const leftColumnWidth = Math.round(760 * scale);
  const rightColumnWidth = width - padding * 2 - leftColumnWidth;

  context.fillStyle = panelStrong;
  context.fillRect(padding, cursorY, leftColumnWidth, tableHeaderHeight);
  context.fillRect(padding + leftColumnWidth, cursorY, rightColumnWidth, tableHeaderHeight);
  context.strokeStyle = border;
  context.strokeRect(padding, cursorY, leftColumnWidth, tableHeaderHeight);
  context.strokeRect(padding + leftColumnWidth, cursorY, rightColumnWidth, tableHeaderHeight);
  context.fillStyle = "#FFFFFF";
  context.font = `700 ${Math.round(18 * scale)}px ${fontFamily}`;
  context.fillText("Campaign", padding + Math.round(18 * scale), cursorY + Math.round(36 * scale));
  context.textAlign = "center";
  context.fillText(
    "Leads",
    padding + leftColumnWidth + rightColumnWidth / 2,
    cursorY + Math.round(36 * scale),
  );

  cursorY += tableHeaderHeight;

  const rows = report.campaignRows.length > 0 ? report.campaignRows : [{ label: "No campaign leads", leads: 0 }];

  rows.forEach((row, index) => {
    const rowY = cursorY + index * rowHeight;
    context.fillStyle = index % 2 === 0 ? rowEven : rowOdd;
    context.fillRect(padding, rowY, leftColumnWidth, rowHeight);
    context.fillRect(padding + leftColumnWidth, rowY, rightColumnWidth, rowHeight);
    context.strokeStyle = border;
    context.strokeRect(padding, rowY, leftColumnWidth, rowHeight);
    context.strokeRect(padding + leftColumnWidth, rowY, rightColumnWidth, rowHeight);

    context.fillStyle = "#FFFFFF";
    context.font = `600 ${Math.round(16 * scale)}px ${fontFamily}`;
    context.textAlign = "left";
    const labelLines = wrapCanvasText(
      context,
      row.label,
      leftColumnWidth - Math.round(32 * scale),
    ).slice(0, 2);
    const lineHeight = Math.round(18 * scale);
    const startY = rowY + rowHeight / 2 - ((labelLines.length - 1) * lineHeight) / 2;

    labelLines.forEach((line, lineIndex) => {
      context.fillText(
        line,
        padding + Math.round(16 * scale),
        startY + lineIndex * lineHeight,
      );
    });

    context.textAlign = "center";
    context.fillText(
      String(row.leads),
      padding + leftColumnWidth + rightColumnWidth / 2,
      rowY + rowHeight / 2 + Math.round(1 * scale),
    );
  });

  cursorY += rows.length * rowHeight;

  context.fillStyle = panelStrong;
  context.fillRect(padding, cursorY, leftColumnWidth, footerHeight);
  context.fillRect(padding + leftColumnWidth, cursorY, rightColumnWidth, footerHeight);
  context.strokeStyle = border;
  context.strokeRect(padding, cursorY, leftColumnWidth, footerHeight);
  context.strokeRect(padding + leftColumnWidth, cursorY, rightColumnWidth, footerHeight);
  context.fillStyle = "#FFFFFF";
  context.font = `700 ${Math.round(18 * scale)}px ${fontFamily}`;
  context.textAlign = "left";
  context.fillText("Total", padding + Math.round(16 * scale), cursorY + footerHeight / 2 + Math.round(1 * scale));
  context.textAlign = "center";
  context.fillText(
    String(report.totalLeads),
    padding + leftColumnWidth + rightColumnWidth / 2,
    cursorY + footerHeight / 2 + Math.round(1 * scale),
  );

  return canvas.encode("jpeg", 100);
}

export async function sendDailyTelegramReports() {
  const dashboard = await getDashboardData();
  const todayKey = getIstDateKey(new Date());
  const todaySummary = dashboard.dailySummaries.find((summary) => summary.date === todayKey);

  if (!todaySummary) {
    await sendTelegramTextMessage(
      [
        "Digital Leads Report",
        `Date: ${formatIstDate(todayKey)}`,
        `Scheduled Time: ${getReportTimeLabel()} IST`,
        "No DATA summary row was found for today.",
      ].join("\n"),
    );
    return;
  }

  const reports = [
    buildBrandReport("all", todaySummary, dashboard),
    buildBrandReport("bigwing", todaySummary, dashboard),
    buildBrandReport("redwing", todaySummary, dashboard),
  ];

  for (const report of reports) {
    await sendTelegramDocument({
      buffer: await createReportImage(report, todayKey),
      caption: `${getBrandHeading(report.brand)} • ${formatIstDate(todayKey)}`,
      filename: `digital-leads-${report.brand}-${todayKey}.jpg`,
    });
  }
}
