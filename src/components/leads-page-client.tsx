"use client";

import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowUpNarrowWide,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Search,
  X,
} from "lucide-react";
import { ReactLenis, type LenisRef } from "lenis/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { useTransition } from "react";
import { type DateRange } from "react-day-picker";

import { DateRangePicker } from "@/components/date-range-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { BRAND_CONFIG, getBrandAssets, type ConcreteBrand } from "@/lib/brands";
import type {
  LeadsPageData,
  LeadsPageQuery,
  LeadsSortDirection,
  LeadsTableRow,
} from "@/lib/sheets";

type LeadsPageClientProps = {
  data: LeadsPageData;
  initialBrand: ConcreteBrand;
  initialQuery: LeadsPageQuery;
};

const leadBrandOptions: ConcreteBrand[] = ["bigwing", "redwing"];
const AUTO_REFRESH_THROTTLE_MS = 15_000;

type LeadTableColumn = {
  key: string;
  label: string;
};

const FIXED_COLUMNS: LeadTableColumn[] = [
  { key: "tab_name", label: "Tab Name" },
  { key: "campaign", label: "Campaign Name" },
  { key: "full_name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone_number", label: "Phone" },
  { key: "location", label: "Location" },
  { key: "date", label: "Created Date" },
];

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return "";
  return digits.slice(-10);
}

function formatName(value: string): string {
  return value.replace(/^[\s\-]+|[\s\-]+$/g, "");
}

function parseDateParam(value: string | null) {
  return value ? new Date(`${value}T00:00:00`) : undefined;
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

function getLeadCellValue(row: LeadsTableRow, columnKey: string) {
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

export function LeadsPageClient({
  data,
  initialBrand,
  initialQuery,
}: LeadsPageClientProps) {
  const [isPending, startTransition] = useTransition();
  const [isBrandPending, startBrandTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const autoRefreshTimestampRef = React.useRef(0);
  const campaignScrollRef = React.useRef<HTMLDivElement | null>(null);
  const tableScrollRef = React.useRef<LenisRef | null>(null);
  const suppressChipClickRef = React.useRef(false);
  const dragStateRef = React.useRef<{
    moved: boolean;
    pointerId: number;
    startScrollLeft: number;
    startX: number;
  } | null>(null);
  const [brand, setBrand] = React.useState<ConcreteBrand>(initialBrand);
  const [selectedCampaigns, setSelectedCampaigns] = React.useState<string[]>(
    initialQuery.campaigns,
  );
  const [searchTerm, setSearchTerm] = React.useState(initialQuery.q);
  const deferredSearch = React.useDeferredValue(searchTerm);
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
    from: parseDateParam(initialQuery.from),
    to: parseDateParam(initialQuery.to),
  });
  const [sortDirection, setSortDirection] = React.useState<LeadsSortDirection>(
    initialQuery.sort,
  );
  const [isTableExpanded, setIsTableExpanded] = React.useState(false);
  const columns = FIXED_COLUMNS;
  const currentPage = data.page;
  const totalPages = data.totalPages;
  const rowsPerPage = data.pageSize;
  const rows = data.rows;

  React.useEffect(() => {
    setBrand(initialBrand);
  }, [initialBrand]);

  React.useEffect(() => {
    setSelectedCampaigns(initialQuery.campaigns);
    setSearchTerm(initialQuery.q);
    setDateRange({
      from: parseDateParam(initialQuery.from),
      to: parseDateParam(initialQuery.to),
    });
    setSortDirection(initialQuery.sort);
  }, [initialQuery.campaigns, initialQuery.from, initialQuery.q, initialQuery.sort, initialQuery.to]);

  const scrollTableToTop = React.useCallback(() => {
    tableScrollRef.current?.lenis?.scrollTo(0, { immediate: true });
    tableScrollRef.current?.wrapper?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const updateMetadata = React.useEffectEvent((nextBrand: ConcreteBrand) => {
    syncBrandMetadata(nextBrand);
  });

  React.useEffect(() => {
    updateMetadata(brand);
  }, [brand, updateMetadata]);

  const replaceQuery = React.useCallback(
    (
      nextValues: Partial<{
        brand: ConcreteBrand;
        campaigns: string[];
        from: string | null;
        page: number;
        q: string;
        sort: LeadsSortDirection;
        to: string | null;
      }>,
      transition: (callback: () => void) => void = startTransition,
    ) => {
      const params = new URLSearchParams(searchParams.toString());
      const nextBrand = nextValues.brand ?? brand;
      const nextCampaigns = nextValues.campaigns ?? selectedCampaigns;
      const nextSearch = nextValues.q ?? deferredSearch.trim();
      const nextFrom =
        nextValues.from ?? (dateRange?.from ? dateRange.from.toISOString().slice(0, 10) : null);
      const nextTo =
        nextValues.to ?? (dateRange?.to ? dateRange.to.toISOString().slice(0, 10) : null);
      const nextSort = nextValues.sort ?? sortDirection;
      const nextPage = nextValues.page ?? currentPage;

      params.set("brand", nextBrand);
      params.delete("campaign");
      nextCampaigns.forEach((campaign) => params.append("campaign", campaign));

      if (nextSearch) {
        params.set("q", nextSearch);
      } else {
        params.delete("q");
      }

      if (nextFrom) {
        params.set("from", nextFrom);
      } else {
        params.delete("from");
      }

      if (nextTo) {
        params.set("to", nextTo);
      } else {
        params.delete("to");
      }

      params.set("sort", nextSort);
      if (nextPage > 1) {
        params.set("page", String(nextPage));
      } else {
        params.delete("page");
      }

      transition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [
      brand,
      currentPage,
      dateRange,
      deferredSearch,
      pathname,
      router,
      searchParams,
      selectedCampaigns,
      sortDirection,
      startTransition,
    ],
  );

  React.useEffect(() => {
    if (deferredSearch.trim() === initialQuery.q) {
      return;
    }

    replaceQuery({ page: 1, q: deferredSearch.trim() });
  }, [deferredSearch, initialQuery.q, replaceQuery]);

  const requestWorkbookRefresh = React.useEffectEvent(() => {
    if (typeof document === "undefined" || document.visibilityState !== "visible") {
      return;
    }

    if (isPending || isBrandPending) {
      return;
    }

    const now = Date.now();
    if (now - autoRefreshTimestampRef.current < AUTO_REFRESH_THROTTLE_MS) {
      return;
    }

    autoRefreshTimestampRef.current = now;
    router.refresh();
  });

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleFocus = () => {
      requestWorkbookRefresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestWorkbookRefresh();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [requestWorkbookRefresh]);

  React.useEffect(() => {
    scrollTableToTop();
  }, [currentPage, scrollTableToTop]);

  React.useEffect(() => {
    if (!isTableExpanded) return;

    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousScrollX = window.scrollX;
    const previousScrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.scrollTo({ top: previousScrollY, left: 0, behavior: "auto" });
    scrollTableToTop();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.scrollTo({ top: previousScrollY, left: previousScrollX, behavior: "auto" });
    };
  }, [isTableExpanded, scrollTableToTop]);

  function handleBrandChange(nextBrand: ConcreteBrand) {
    if (nextBrand === brand || isBrandPending) {
      return;
    }

    startBrandTransition(() => {
      setBrand(nextBrand);
      setSelectedCampaigns([]);
      replaceQuery(
        {
          brand: nextBrand,
          campaigns: [],
          page: 1,
        },
        startBrandTransition,
      );
    });
  }

  function toggleCampaign(campaign: string) {
    const nextCampaigns = selectedCampaigns.includes(campaign)
      ? selectedCampaigns.filter((item) => item !== campaign)
      : [...selectedCampaigns, campaign];

    setSelectedCampaigns(nextCampaigns);
    replaceQuery({ campaigns: nextCampaigns, page: 1 });
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
      moved: false,
      pointerId: event.pointerId,
      startScrollLeft: container.scrollLeft,
      startX: event.clientX,
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

  function handleDownloadCurrentPage() {
    const exportColumns = columns.filter((column) => column.key !== "tab_name");
    const headerLabels = ["Sl No", ...exportColumns.map((column) => column.label)];
    const csvRows = rows.map((row, index) => [
      String((currentPage - 1) * rowsPerPage + index + 1),
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
    link.download = `${sanitizeFileNameSegment(BRAND_CONFIG[brand].label)}-${dateScope}-page-${currentPage}-leads.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const leadsBackground = brand === "bigwing" ? "#000000" : "#0D4D8B";
  const tableContainerBg = brand === "bigwing" ? "bg-[#111111]/60" : "bg-[#0a2744]/50";
  const tableHeadBg = brand === "bigwing" ? "bg-[#1a1a1a]/92" : "bg-[#143d66]/92";
  const expandedTablePanelBg = brand === "bigwing" ? "bg-[#101010]" : "bg-[#0a2744]";
  const expandedContentShellClasses = isTableExpanded
    ? "mx-auto flex h-full w-full max-w-[1800px] flex-col"
    : "";
  const tablePanelClasses = isTableExpanded
    ? `fixed inset-0 z-50 flex h-screen w-screen flex-col overflow-hidden border border-white/12 ${expandedTablePanelBg} shadow-[0_24px_80px_rgba(0,0,0,0.45)]`
    : "";
  const tableScrollClasses = isTableExpanded
    ? "crm-touch-scroll min-h-0 flex-1 overflow-auto pr-1 [scrollbar-color:rgba(255,255,255,0.24)_rgba(255,255,255,0.06)] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/6 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-[1px] [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-white/24 [&::-webkit-scrollbar-thumb]:bg-clip-padding hover:[&::-webkit-scrollbar-thumb]:bg-white/34"
    : "crm-touch-scroll max-h-[70vh] overflow-auto pr-1 [scrollbar-color:rgba(255,255,255,0.24)_rgba(255,255,255,0.06)] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/6 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-[1px] [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-white/24 [&::-webkit-scrollbar-thumb]:bg-clip-padding hover:[&::-webkit-scrollbar-thumb]:bg-white/34";

  const tableMarkup = (
    <div
      className={`crm-surface-radius overflow-hidden ${isTableExpanded ? "mx-auto my-4 w-[calc(100%-2rem)]" : ""} border border-white/10 ${
        isTableExpanded ? expandedTablePanelBg : tableContainerBg
      } ${isTableExpanded ? "flex min-h-0 flex-1 flex-col" : ""}`}
    >
      <ReactLenis
        ref={tableScrollRef}
        className={tableScrollClasses}
        options={{
          autoRaf: true,
          lerp: 0.12,
          overscroll: true,
          smoothWheel: true,
          stopInertiaOnNavigate: true,
          syncTouch: true,
          syncTouchLerp: 0.08,
          touchMultiplier: 1,
          wheelMultiplier: 1,
        }}
      >
        <table className="w-full min-w-[900px] table-fixed border-collapse text-left">
          <thead className={`sticky top-0 z-10 ${tableHeadBg} backdrop-blur-xl`}>
            <tr>
              <th className="w-[72px] min-w-[72px] max-w-[72px] border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.22em] text-white/52">
                Sl No
              </th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.22em] text-white/52 ${
                    column.key === "tab_name"
                      ? "w-[160px] min-w-[160px] max-w-[160px]"
                      : column.key === "campaign"
                        ? "w-[280px] min-w-[280px] max-w-[280px]"
                        : column.key === "full_name"
                          ? "w-[200px] min-w-[200px] max-w-[200px]"
                          : column.key === "email"
                            ? "w-[260px] min-w-[260px] max-w-[260px]"
                            : column.key === "phone_number"
                              ? "w-[140px] min-w-[140px] max-w-[140px]"
                              : column.key === "location"
                                ? "w-[150px] min-w-[150px] max-w-[150px]"
                                : column.key === "date"
                                  ? "w-[140px] min-w-[140px] max-w-[140px]"
                                  : ""
                  }`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row, rowIndex) => (
                <tr key={row.id} className="border-b border-white/8 last:border-b-0">
                  <td className="w-[72px] min-w-[72px] max-w-[72px] px-4 py-3 align-top text-sm tabular-nums text-white/52">
                    {(currentPage - 1) * rowsPerPage + rowIndex + 1}
                  </td>
                  {columns.map((column) => {
                    const cellValue = getLeadCellValue(row, column.key) || "-";
                    const isEmail = column.key === "email";
                    const isTabName = column.key === "tab_name";
                    const isEmailTruncated = !isTableExpanded && isEmail && cellValue.length > 25;
                    const isTabNameTruncated = isTabName && cellValue.length > 15;
                    const isTruncated = isEmailTruncated || isTabNameTruncated;
                    const displayValue = isEmailTruncated
                      ? `${cellValue.slice(0, 25)}...`
                      : isTabNameTruncated
                        ? `${cellValue.slice(0, 15)}...`
                        : cellValue;

                    return (
                      <td
                        key={`${row.id}-${column.key}`}
                        className={`px-4 py-3 align-top text-sm text-white/86 ${
                          column.key === "tab_name"
                            ? "w-[160px] min-w-[160px] max-w-[160px]"
                            : column.key === "campaign"
                              ? "w-[280px] min-w-[280px] max-w-[280px]"
                              : column.key === "full_name"
                                ? "w-[200px] min-w-[200px] max-w-[200px]"
                                : column.key === "email"
                                  ? "w-[260px] min-w-[260px] max-w-[260px]"
                                  : column.key === "phone_number"
                                    ? "w-[140px] min-w-[140px] max-w-[140px]"
                                    : column.key === "location"
                                      ? "w-[150px] min-w-[150px] max-w-[150px]"
                                      : column.key === "date"
                                        ? "w-[140px] min-w-[140px] max-w-[140px]"
                                        : ""
                        }`}
                      >
                        <div
                          className={
                            isEmail
                              ? isTableExpanded
                                ? "max-w-[260px] whitespace-normal break-all"
                                : `max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap ${
                                    isTruncated ? "cursor-help" : ""
                                  }`
                              : column.key === "campaign"
                                ? isTableExpanded
                                  ? "max-w-[280px] whitespace-normal break-words"
                                  : "max-w-[280px] whitespace-normal break-words"
                                : column.key === "full_name"
                                  ? isTableExpanded
                                    ? "max-w-[200px] whitespace-normal break-words"
                                    : "max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap"
                                  : isTabName
                                    ? `max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap ${
                                        isTruncated ? "cursor-help" : ""
                                      }`
                                    : column.key === "phone_number"
                                      ? "max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap"
                                      : column.key === "location"
                                        ? "max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap"
                                        : column.key === "date"
                                          ? "max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap"
                                          : "max-w-[280px] whitespace-normal break-words"
                          }
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
                <td colSpan={columns.length + 1} className="px-4 py-10 text-center text-sm text-white/58">
                  No leads match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ReactLenis>
    </div>
  );

  const paginationMarkup =
    totalPages > 1 ? (
      <div
        className={`${
          isTableExpanded ? "mx-auto mb-4 w-[calc(100%-2rem)]" : "mt-4"
        } crm-surface-radius flex flex-col gap-3 border border-white/10 bg-white/6 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between`}
      >
        <span className="text-center text-sm text-white/58">
          Showing {(currentPage - 1) * rowsPerPage + 1}–
          {Math.min(currentPage * rowsPerPage, data.total)} of {data.total} leads
        </span>
        <div className="flex w-full items-center justify-between gap-2 lg:w-auto lg:justify-end">
          <Button
            variant="ghost"
            className="h-9 gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 text-xs text-white/82 shadow-none backdrop-blur-xl hover:bg-white/12 hover:text-white disabled:opacity-30"
            disabled={currentPage <= 1}
            onClick={() => replaceQuery({ page: Math.max(1, currentPage - 1) })}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </Button>
          <span className="min-w-[56px] text-center text-sm font-medium text-white tabular-nums sm:min-w-[80px]">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            className="h-9 gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 text-xs text-white/82 shadow-none backdrop-blur-xl hover:bg-white/12 hover:text-white disabled:opacity-30"
            disabled={currentPage >= totalPages}
            onClick={() => replaceQuery({ page: Math.min(totalPages, currentPage + 1) })}
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    ) : null;

  return (
    <div className="min-h-screen text-white transition-[background-color] duration-500 ease-out" style={{ backgroundColor: leadsBackground }}>
      {isTableExpanded ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" />
          <div className={tablePanelClasses}>
            <div className={expandedContentShellClasses}>
              <div className="flex items-center justify-between rounded-b-[20px] border-b border-white/10 bg-white/6 px-4 py-3 backdrop-blur-xl">
                <div>
                  <h3 className="text-sm font-semibold text-white">Leads table</h3>
                  <p className="text-xs text-white/58">
                    Showing {(currentPage - 1) * rowsPerPage + 1}–
                    {Math.min(currentPage * rowsPerPage, data.total)} of {data.total} leads
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="h-9 gap-2 rounded-full border border-white/12 bg-white/8 px-3 text-xs text-white/82 shadow-none backdrop-blur-xl hover:bg-white/12 hover:text-white"
                  onClick={() => setIsTableExpanded(false)}
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                  Close
                </Button>
              </div>
              {tableMarkup}
              {paginationMarkup}
            </div>
          </div>
        </>
      ) : null}

      <div className="min-h-screen">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
          <section className="crm-surface-radius border border-white/14 bg-white/10 p-4 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl sm:p-5">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-4 flex items-center gap-3">
                    <Button
                      asChild
                      variant="ghost"
                      className="h-8 gap-2 rounded-full border border-white/12 bg-white/8 px-3 text-[11px] font-medium text-white/82 shadow-none backdrop-blur-xl hover:bg-white/8 hover:text-white"
                      onClick={(event) => {
                        event.preventDefault();
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
                      {BRAND_CONFIG[brand].label} Leads {data.total}
                    </div>
                  </div>
                  {data.error ? (
                    <p className="rounded-2xl border border-[#ffb4b4]/20 bg-[#ffb4b4]/8 px-4 py-3 text-sm text-[#ffe2e2]">
                      {data.error}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                  {leadBrandOptions.map((option) => {
                    const selected = option === brand;
                    const loading = isBrandPending && selected;

                    return (
                      <Button
                        key={option}
                        variant="ghost"
                        aria-busy={loading}
                        className={
                          selected
                            ? "min-w-[80px] gap-2 rounded-full border border-white/70 bg-white px-3 py-1 text-xs font-medium text-black shadow-[0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl hover:bg-white hover:text-black sm:min-w-[104px] sm:px-5 sm:text-sm"
                            : "min-w-[80px] gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-white/62 shadow-none backdrop-blur-xl hover:bg-white/10 hover:text-white sm:min-w-[104px] sm:px-5 sm:text-sm"
                        }
                        onClick={() => handleBrandChange(option)}
                      >
                        {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                        {BRAND_CONFIG[option].label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="mb-2 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
                <div className="lg:pb-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-semibold leading-tight">Lead table</h2>
                  </div>
                  <p className="mt-0.5 text-sm text-white/58">
                    {selectedCampaigns.length === 0
                      ? "Showing all campaigns"
                      : "Campaign filters applied"}
                  </p>
                </div>

                <div className="min-w-0 self-start">
                  <Field className="gap-0">
                    <FieldLabel htmlFor="lead-search" className="mb-2 leading-none">
                      Search Leads & Filter
                    </FieldLabel>
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_260px] lg:items-start">
                      <div className="relative col-span-2 h-[48px] w-full min-w-0 rounded-[22px] border border-white/16 bg-white/10 lg:col-span-1">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/44" />
                        <input
                          id="lead-search"
                          value={searchTerm}
                          onChange={(event) => setSearchTerm(event.target.value)}
                          placeholder="Search name, phone, campaign, email, location..."
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
                      <Button
                        variant="ghost"
                        className={
                          sortDirection === "desc"
                            ? "h-[42px] w-full shrink-0 gap-1 rounded-[18px] border border-white/70 bg-white px-3 text-[11px] font-medium text-black shadow-[0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl hover:bg-white hover:text-black sm:h-[48px] sm:w-auto sm:gap-1.5 sm:rounded-[22px] sm:px-4 sm:text-xs"
                            : "h-[42px] w-full shrink-0 gap-1 rounded-[18px] border border-white/16 bg-white/10 px-3 text-[11px] text-white/72 backdrop-blur-xl hover:bg-white/14 hover:text-white sm:h-[48px] sm:w-auto sm:gap-1.5 sm:rounded-[22px] sm:px-4 sm:text-xs"
                        }
                        onClick={() => {
                          setSortDirection("desc");
                          replaceQuery({ page: 1, sort: "desc" });
                        }}
                      >
                        <ArrowDownWideNarrow className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        DESC
                      </Button>
                      <Button
                        variant="ghost"
                        className={
                          sortDirection === "asc"
                            ? "h-[42px] w-full shrink-0 gap-1 rounded-[18px] border border-white/70 bg-white px-3 text-[11px] font-medium text-black shadow-[0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl hover:bg-white hover:text-black sm:h-[48px] sm:w-auto sm:gap-1.5 sm:rounded-[22px] sm:px-4 sm:text-xs"
                            : "h-[42px] w-full shrink-0 gap-1 rounded-[18px] border border-white/16 bg-white/10 px-3 text-[11px] text-white/72 backdrop-blur-xl hover:bg-white/14 hover:text-white sm:h-[48px] sm:w-auto sm:gap-1.5 sm:rounded-[22px] sm:px-4 sm:text-xs"
                        }
                        onClick={() => {
                          setSortDirection("asc");
                          replaceQuery({ page: 1, sort: "asc" });
                        }}
                      >
                        <ArrowUpNarrowWide className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        ASC
                      </Button>
                      <div className="col-span-2 w-full min-w-0 lg:col-span-1">
                        <DateRangePicker
                          date={dateRange}
                          onSelect={(nextRange) => {
                            setDateRange(nextRange);
                            replaceQuery({
                              from: nextRange?.from
                                ? nextRange.from.toISOString().slice(0, 10)
                                : null,
                              page: 1,
                              to: nextRange?.to
                                ? nextRange.to.toISOString().slice(0, 10)
                                : null,
                            });
                          }}
                          brand={brand}
                          closeOnApply={false}
                          showLabel={false}
                          footerAction={
                            <Button
                              type="button"
                              variant="ghost"
                              className="rounded-xl px-4 text-[#fff] hover:bg-white/10 hover:text-[#fff] disabled:opacity-40"
                              onClick={handleDownloadCurrentPage}
                              disabled={rows.length === 0}
                            >
                              Download Page CSV
                            </Button>
                          }
                        />
                      </div>
                    </div>
                  </Field>
                </div>
              </div>

              <div className="mb-1 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div
                  ref={campaignScrollRef}
                  className="crm-touch-scroll min-w-0 flex-1 cursor-grab overflow-x-auto pb-0.5 active:cursor-grabbing [scrollbar-color:rgba(255,255,255,0.28)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/24 hover:[&::-webkit-scrollbar-thumb]:bg-white/34"
                  data-lenis-prevent
                  data-lenis-prevent-touch
                  data-lenis-prevent-wheel
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
                      onClick={() => {
                        setSelectedCampaigns([]);
                        replaceQuery({ campaigns: [], page: 1 });
                      }}
                    >
                      All campaigns
                    </Button>
                    {data.campaignOptions.map((campaign) => {
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
                <div className="flex justify-end lg:pb-2">
                  <Button
                    variant="ghost"
                    className="h-9 gap-2 rounded-full border border-white/12 bg-white/8 px-3 text-xs text-white/82 shadow-none backdrop-blur-xl hover:bg-white/12 hover:text-white"
                    onClick={() => setIsTableExpanded((current) => !current)}
                  >
                    {isTableExpanded ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                    {isTableExpanded ? "Exit full screen" : "Expand table"}
                  </Button>
                </div>
              </div>

              {!isTableExpanded ? tableMarkup : null}
              {!isTableExpanded ? paginationMarkup : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
