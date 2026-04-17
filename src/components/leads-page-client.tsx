"use client";

import { endOfDay, parseISO, startOfDay } from "date-fns";
import { ArrowDownWideNarrow, ArrowLeft, ArrowUpNarrowWide, ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { useTransition } from "react";
import { type DateRange } from "react-day-picker";

import { DateRangePicker } from "@/components/date-range-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { BRAND_CONFIG, getBrandAssets, type ConcreteBrand } from "@/lib/brands";
import type { DashboardRow, LeadTableColumn, WorkbookData } from "@/lib/sheets";

type LeadsPageClientProps = {
  workbook: WorkbookData;
  initialBrand: ConcreteBrand;
};

const leadBrandOptions: ConcreteBrand[] = ["bigwing", "redwing"];

const FIXED_COLUMNS: LeadTableColumn[] = [
  { key: "tab_name", label: "Tab Name" },
  { key: "campaign", label: "Campaign Name" },
  { key: "full_name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone_number", label: "Phone" },
  { key: "location", label: "Location" },
  { key: "date", label: "Created Date" },
];

/** Strip non-digits, return the rightmost 10 digits */
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return "";
  return digits.slice(-10);
}

/** Trim leading/trailing spaces and dashes from name */
function formatName(value: string): string {
  return value.replace(/^[\s\-]+|[\s\-]+$/g, "");
}

function syncBrandMetadata(brand: ConcreteBrand) {
  if (typeof document === "undefined") return;

  const selected = getBrandAssets(brand);
  const iconTargets = [
    { rel: "icon", href: selected.faviconIco },
    { rel: "icon", sizes: "16x16", href: selected.favicon16 },
    { rel: "icon", sizes: "32x32", href: selected.favicon32 },
    { rel: "apple-touch-icon", href: selected.appleTouchIcon },
  ];

  for (const config of iconTargets) {
    const selector = config.sizes
      ? `link[rel="${config.rel}"][sizes="${config.sizes}"]`
      : `link[rel="${config.rel}"]:not([sizes])`;
    let link = document.head.querySelector<HTMLLinkElement>(selector);

    if (!link) {
      link = document.createElement("link");
      link.rel = config.rel;
      if (config.sizes) link.sizes = config.sizes;
      document.head.appendChild(link);
    }

    link.href = config.href;
  }

  let manifest = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!manifest) {
    manifest = document.createElement("link");
    manifest.rel = "manifest";
    document.head.appendChild(manifest);
  }

  manifest.href = `/brand-manifest?brand=${brand}`;
}

function getLeadCellValue(row: DashboardRow, columnKey: string) {
  switch (columnKey) {
    case "tab_name":
      return row.tabName;
    case "brand":
      return row.brand;
    case "date":
      return row.date ?? "";
    case "campaign":
      return row.campaign;
    case "ad_name":
      return row.adName;
    case "form_name":
      return row.formName;
    case "platform":
      return row.platform;
    case "location":
      return row.location;
    case "full_name":
      return formatName(row.fullName);
    case "phone_number":
      return formatPhone(row.phoneNumber);
    case "email":
      return row.email;
    case "lead_status":
      return row.leadStatus;
    default:
      return row.raw[columnKey] ?? "";
  }
}

function getSearchableText(row: DashboardRow, columns: LeadTableColumn[]) {
  return columns
    .map((column) => getLeadCellValue(row, column.key))
    .join(" ")
    .toLowerCase();
}

function sanitizeFileNameSegment(value: string) {
  return value
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function escapeCsvCell(value: string) {
  const normalized = value.replace(/\r?\n/g, " ").trim();
  const escaped = normalized.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function LeadsPageClient({ workbook, initialBrand }: LeadsPageClientProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const campaignScrollRef = React.useRef<HTMLDivElement | null>(null);
  const suppressChipClickRef = React.useRef(false);
  const dragStateRef = React.useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null);
  const [brand, setBrand] = React.useState<ConcreteBrand>(initialBrand);
  const [selectedCampaigns, setSelectedCampaigns] = React.useState<string[]>([]);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>();
  const deferredSearch = React.useDeferredValue(searchTerm);
  const [sortDirection, setSortDirection] = React.useState<"desc" | "asc">("desc");
  const [currentPage, setCurrentPage] = React.useState(1);
  const rowsPerPage = 50;
  const columns = FIXED_COLUMNS;

  const updateMetadata = React.useEffectEvent((nextBrand: ConcreteBrand) => {
    syncBrandMetadata(nextBrand);
  });

  React.useEffect(() => {
    updateMetadata(brand);
  }, [brand]);

  React.useEffect(() => {
    setSelectedCampaigns([]);
  }, [brand]);

  const brandRows = workbook.rows.filter((row) => row.brand === brand);
  const campaignOptions = Array.from(new Set(brandRows.map((row) => row.campaign).filter(Boolean))).sort();

  const rows = brandRows
    .filter((row) => {
      if (selectedCampaigns.length === 0) return true;
      return selectedCampaigns.includes(row.campaign);
    })
    .filter((row) => {
      if (!deferredSearch) return true;
      return getSearchableText(row, columns).includes(deferredSearch.toLowerCase());
    })
    .filter((row) => {
      if (!dateRange?.from && !dateRange?.to) return true;
      if (!row.date) return false;

      const rowDate = parseISO(row.date);
      if (Number.isNaN(rowDate.getTime())) return false;

      const fromDate = dateRange.from ? startOfDay(dateRange.from) : null;
      const toDate = dateRange.to ? endOfDay(dateRange.to) : null;

      if (fromDate && rowDate < fromDate) return false;
      if (toDate && rowDate > toDate) return false;
      return true;
    })
    .sort((a, b) => {
      const dateCompare = (a.date ?? "").localeCompare(b.date ?? "");
      if (dateCompare !== 0) {
        return sortDirection === "asc" ? dateCompare : -dateCompare;
      }
      // tie breaker for same dates
      return sortDirection === "asc"
        ? a.id.localeCompare(b.id, undefined, { numeric: true })
        : b.id.localeCompare(a.id, undefined, { numeric: true });
    });

  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRows = rows.slice((safeCurrentPage - 1) * rowsPerPage, safeCurrentPage * rowsPerPage);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [brand, selectedCampaigns, deferredSearch, dateRange, sortDirection]);

  function handleBrandChange(nextBrand: ConcreteBrand) {
    startTransition(() => {
      setBrand(nextBrand);
      const nextSearch = new URLSearchParams(searchParams.toString());
      nextSearch.set("brand", nextBrand);
      router.replace(`${pathname}?${nextSearch.toString()}`, { scroll: false });
    });
  }

  function toggleCampaign(campaign: string) {
    setSelectedCampaigns((current) =>
      current.includes(campaign) ? current.filter((item) => item !== campaign) : [...current, campaign],
    );
  }

  function handleCampaignWheel(event: React.WheelEvent<HTMLDivElement>) {
    const container = campaignScrollRef.current;
    if (!container) return;

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) return;

    container.scrollLeft += delta;
    event.preventDefault();
  }

  function handleCampaignPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const container = campaignScrollRef.current;
    if (!container) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: container.scrollLeft,
      moved: false,
    };
  }

  function handleCampaignPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const container = campaignScrollRef.current;
    const dragState = dragStateRef.current;
    if (!container || !dragState || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    if (!dragState.moved && Math.abs(deltaX) < 6) return;

    dragState.moved = true;
    container.scrollLeft = dragState.startScrollLeft - deltaX;
  }

  function handleCampaignPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    suppressChipClickRef.current = dragState.moved;
    dragStateRef.current = null;
  }

  function handleCampaignClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (!suppressChipClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressChipClickRef.current = false;
  }

  function handleDownloadCurrentView() {
    const exportColumns = columns.filter((column) => column.key !== "tab_name");
    const headerLabels = ["Sl No", ...exportColumns.map((column) => column.label)];
    const csvRows = rows.map((row, index) => [
      String(index + 1),
      ...exportColumns.map((column) => getLeadCellValue(row, column.key) || "-"),
    ]);
    const csv = [headerLabels, ...csvRows]
      .map((line) => line.map((cell) => escapeCsvCell(cell)).join(","))
      .join("\n");

    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateScope =
      dateRange?.from || dateRange?.to
        ? `${dateRange?.from ? dateRange.from.toISOString().slice(0, 10) : "start"}-to-${dateRange?.to ? dateRange.to.toISOString().slice(0, 10) : "end"}`
        : "all-dates";

    link.href = url;
    link.download = `${sanitizeFileNameSegment(BRAND_CONFIG[brand].label)}-${dateScope}-leads.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const leadsBackground = brand === "bigwing" ? "#000000" : "#0D4D8B";
  const tableContainerBg = brand === "bigwing" ? "bg-[#111111]/60" : "bg-[#0a2744]/50";
  const tableHeadBg = brand === "bigwing" ? "bg-[#1a1a1a]/92" : "bg-[#143d66]/92";

  return (
    <div className="min-h-screen text-white transition-[background-color] duration-500 ease-out" style={{ backgroundColor: leadsBackground }}>
      <div className="min-h-screen">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
          <section className="rounded-[34px] border border-white/14 bg-white/10 p-4 sm:p-5 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-4 flex items-center gap-3">
                    <Button
                      asChild
                      variant="ghost"
                      className="h-8 gap-2 rounded-full border border-white/12 bg-white/8 px-3 text-[11px] font-medium text-white/82 shadow-none backdrop-blur-xl hover:bg-white/8 hover:text-white"
                      onClick={(e) => {
                        e.preventDefault();
                        startTransition(() => router.push(`/?brand=${brand}`));
                      }}
                      disabled={isPending}
                    >
                      <Link href={`/?brand=${brand}`}>
                        <ArrowLeft className="h-3.5 w-3.5" />
                        {isPending ? "Loading..." : "Back"}
                      </Link>
                    </Button>
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-white/65">
                      <ChevronDown className="h-3.5 w-3.5 rotate-[-90deg]" />
                      {BRAND_CONFIG[brand].label} Leads {rows.length}
                    </div>
                  </div>
                  {workbook.error ? (
                    <p className="rounded-2xl border border-[#ffb4b4]/20 bg-[#ffb4b4]/8 px-4 py-3 text-sm text-[#ffe2e2]">
                      {workbook.error}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                  {leadBrandOptions.map((option) => {
                    const selected = option === brand;

                    return (
                      <Button
                        key={option}
                        variant="ghost"
                        className={
                          selected
                            ? "min-w-[80px] sm:min-w-[104px] rounded-full border border-white/70 bg-white px-3 sm:px-5 py-1 text-xs sm:text-sm font-medium text-black shadow-[0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl hover:bg-white hover:text-black"
                            : "min-w-[80px] sm:min-w-[104px] rounded-full border border-white/10 bg-white/6 px-3 sm:px-5 py-1 text-xs sm:text-sm text-white/62 shadow-none backdrop-blur-xl hover:bg-white/10 hover:text-white"
                        }
                        onClick={() => handleBrandChange(option)}
                      >
                        {BRAND_CONFIG[option].label}
                      </Button>
                    );
                  })}
                </div>
              </div>
           
              <div className="mb-3 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-end">
                <div className="lg:pb-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-semibold leading-tight">Lead table</h2>
                  </div>
                  <p className="mt-0.5 text-sm text-white/58">
                    {selectedCampaigns.length === 0
                      ? "Showing all campaigns"
                      : `Filtered by: ${selectedCampaigns.join(", ")}`}
                  </p>
                </div>

                <div className="min-w-0">
                  <Field>
                    <FieldLabel htmlFor="lead-search">Search Leads & Filter</FieldLabel>
                    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_260px_auto_auto] lg:items-end">
                      <div className="relative h-[48px] w-full min-w-0 rounded-[22px] border border-white/16 bg-white/10">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/44" />
                        <input
                          id="lead-search"
                          value={searchTerm}
                          onChange={(event) => setSearchTerm(event.target.value)}
                          placeholder="Search name, phone, campaign, ad, location..."
                          autoComplete="off"
                          className="h-[48px] w-full rounded-[22px] bg-transparent pl-11 pr-10 text-sm text-white outline-none placeholder:text-white/34"
                        />
                        {searchTerm ? (
                          <button
                            type="button"
                            onClick={() => setSearchTerm("")}
                            className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/12 text-white/72 transition hover:bg-white/20 hover:text-white"
                            aria-label="Clear search"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                      <div className="w-full min-w-0">
                        <DateRangePicker
                          date={dateRange}
                          onSelect={setDateRange}
                          brand={brand}
                          closeOnApply={false}
                          footerAction={
                            <Button
                              type="button"
                              variant="ghost"
                              className="rounded-xl px-4 text-[#fff] hover:bg-white/10 hover:text-[#fff] disabled:opacity-40"
                              onClick={handleDownloadCurrentView}
                              disabled={rows.length === 0}
                            >
                              Download CSV
                            </Button>
                          }
                        />
                      </div>
                      <Button
                        variant="ghost"
                        className={sortDirection === "desc"
                          ? "h-[42px] w-full shrink-0 gap-1 rounded-[18px] border border-white/70 bg-white px-3 text-[11px] font-medium text-black shadow-[0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl hover:bg-white hover:text-black sm:h-[48px] sm:w-auto sm:gap-1.5 sm:rounded-[22px] sm:px-4 sm:text-xs"
                          : "h-[42px] w-full shrink-0 gap-1 rounded-[18px] border border-white/16 bg-white/10 px-3 text-[11px] text-white/72 backdrop-blur-xl hover:bg-white/14 hover:text-white sm:h-[48px] sm:w-auto sm:gap-1.5 sm:rounded-[22px] sm:px-4 sm:text-xs"
                        }
                        onClick={() => setSortDirection("desc")}
                      >
                        <ArrowDownWideNarrow className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        DESC
                      </Button>
                      <Button
                        variant="ghost"
                        className={sortDirection === "asc"
                          ? "h-[42px] w-full shrink-0 gap-1 rounded-[18px] border border-white/70 bg-white px-3 text-[11px] font-medium text-black shadow-[0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl hover:bg-white hover:text-black sm:h-[48px] sm:w-auto sm:gap-1.5 sm:rounded-[22px] sm:px-4 sm:text-xs"
                          : "h-[42px] w-full shrink-0 gap-1 rounded-[18px] border border-white/16 bg-white/10 px-3 text-[11px] text-white/72 backdrop-blur-xl hover:bg-white/14 hover:text-white sm:h-[48px] sm:w-auto sm:gap-1.5 sm:rounded-[22px] sm:px-4 sm:text-xs"
                        }
                        onClick={() => setSortDirection("asc")}
                      >
                        <ArrowUpNarrowWide className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        ASC
                      </Button>
                    </div>
                  </Field>
                </div>
              </div>

            <div
              ref={campaignScrollRef}
              className="mb-3 cursor-grab overflow-x-auto pb-1 active:cursor-grabbing [scrollbar-color:rgba(255,255,255,0.28)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/24 hover:[&::-webkit-scrollbar-thumb]:bg-white/34"
              onClickCapture={handleCampaignClickCapture}
              onPointerDown={handleCampaignPointerDown}
              onPointerMove={handleCampaignPointerMove}
              onPointerUp={handleCampaignPointerEnd}
              onPointerCancel={handleCampaignPointerEnd}
              onWheel={handleCampaignWheel}
            >
              <div className="flex w-max min-w-full gap-2 pb-2">
                <Button
                  variant="ghost"
                  className={
                    selectedCampaigns.length === 0
                      ? "shrink-0 rounded-full border border-white/70 bg-white px-4 py-0.5 font-medium text-black shadow-[0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl hover:bg-white hover:text-black"
                      : "shrink-0 rounded-full border border-white/10 bg-white/6 px-4 py-0.5 text-white/74 shadow-none backdrop-blur-xl hover:bg-white/10 hover:text-white"
                  }
                  onClick={() => setSelectedCampaigns([])}
                >
                  All campaigns
                </Button>
                {campaignOptions.map((campaign) => {
                  const selected = selectedCampaigns.includes(campaign);

                  return (
                    <Button
                      key={campaign}
                      variant="ghost"
                      className={
                        selected
                          ? "shrink-0 rounded-full border border-white/70 bg-white px-4 py-0.5 font-medium text-black shadow-[0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl hover:bg-white hover:text-black"
                          : "shrink-0 rounded-full border border-white/10 bg-white/6 px-4 py-0.5 text-white/74 shadow-none backdrop-blur-xl hover:bg-white/10 hover:text-white"
                      }
                      onClick={() => toggleCampaign(campaign)}
                    >
                      {campaign}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className={`overflow-hidden rounded-[18px] border border-white/10 ${tableContainerBg}`}>
              <div className="max-h-[70vh] overflow-auto pr-1 [scrollbar-color:rgba(255,255,255,0.24)_rgba(255,255,255,0.06)] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/6 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-[1px] [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-white/24 [&::-webkit-scrollbar-thumb]:bg-clip-padding hover:[&::-webkit-scrollbar-thumb]:bg-white/34">
                <table className="w-full min-w-[900px] border-collapse text-left">
                  <thead className={`sticky top-0 z-10 ${tableHeadBg} backdrop-blur-xl`}>
                    <tr>
                      <th className="border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.22em] text-white/52">
                        Sl No
                      </th>
                      {columns.map((column) => (
                        <th
                          key={column.key}
                          className="border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.22em] text-white/52"
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.length > 0 ? (
                      paginatedRows.map((row, rowIndex) => (
                        <tr key={row.id} className="border-b border-white/8 last:border-b-0">
                          <td className="px-4 py-3 align-top text-sm tabular-nums text-white/52">
                            {(safeCurrentPage - 1) * rowsPerPage + rowIndex + 1}
                          </td>
                          {columns.map((column) => {
                            const cellValue = getLeadCellValue(row, column.key) || "-";
                            const isEmail = column.key === "email";
                            const isTruncated = isEmail && cellValue.length > 25;
                            const displayValue = isTruncated ? `${cellValue.slice(0, 25)}...` : cellValue;

                            return (
                              <td key={`${row.id}-${column.key}`} className="px-4 py-3 align-top text-sm text-white/86">
                                <div
                                  className={`max-w-[280px] whitespace-normal break-words ${
                                    isTruncated ? "cursor-help" : ""
                                  }`}
                                  title={isTruncated ? cellValue : undefined}
                                >
                                  {displayValue}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={columns.length + 1}
                          className="px-4 py-10 text-center text-sm text-white/58"
                        >
                          No leads match the current search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {totalPages > 1 ? (
              <div className="mt-4 flex items-center justify-between rounded-[22px] border border-white/10 bg-white/6 px-5 py-3">
                <span className="text-sm text-white/58">
                  Showing {(safeCurrentPage - 1) * rowsPerPage + 1}–{Math.min(safeCurrentPage * rowsPerPage, rows.length)} of {rows.length} leads
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    className="h-9 gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 text-xs text-white/82 shadow-none backdrop-blur-xl hover:bg-white/12 hover:text-white disabled:opacity-30"
                    disabled={safeCurrentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Prev
                  </Button>
                  <span className="min-w-[80px] text-center text-sm font-medium text-white tabular-nums">
                    {safeCurrentPage} / {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    className="h-9 gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 text-xs text-white/82 shadow-none backdrop-blur-xl hover:bg-white/12 hover:text-white disabled:opacity-30"
                    disabled={safeCurrentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
