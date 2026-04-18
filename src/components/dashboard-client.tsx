"use client";

import { endOfDay, isAfter, isBefore, startOfDay } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronDown,
  Clipboard,
  CircleAlert,
  FileUp,
  IndianRupee,
  KeyRound,
  Layers3,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { useTransition } from "react";
import { type DateRange } from "react-day-picker";

import { DateRangePicker } from "@/components/date-range-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BRAND_CONFIG, getBrandAssets, type Brand } from "@/lib/brands";
import type { DashboardRow, WorkbookData } from "@/lib/sheets";

type DashboardClientProps = {
  workbook: WorkbookData;
  initialBrand: Brand;
};

type Summary = {
  totalLeads: number;
  uniquePhones: number;
  campaigns: number;
  tabs: number;
};

type TimelineDatum = {
  date: string;
  label: string;
  tooltipLabel: string;
  tooltipHeading: string;
  leads: number;
  bigwingLeads: number;
  redwingLeads: number;
};

type PlatformDatum = {
  name: string;
  value: number;
  bigwingValue: number;
  redwingValue: number;
};

type DigitalLeadImportMeta = {
  lastImportedDate: string | null;
  prompt: string;
};

type MetaSpendSummary = {
  configured: boolean;
  currency: string;
  matchedCampaigns: number;
  requestedCampaigns: number;
  totalSpend: number;
};

const brandOptions: Brand[] = ["all", "bigwing", "redwing"];
const DASHBOARD_RANGE_START = new Date(new Date().getFullYear(), 3, 1);
const AUTO_REFRESH_INTERVAL_MS = 30_000;
const AUTO_REFRESH_THROTTLE_MS = 15_000;

type FilterSelectProps = {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
};

function FilterSelect({ id, label, value, options, onChange, disabled = false }: FilterSelectProps) {
  const [open, setOpen] = React.useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? label;

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            className={
              disabled
                ? "flex h-[48px] w-full items-center justify-between rounded-[22px] border border-white/10 bg-white/6 px-4 text-sm text-white/45 outline-none"
                : "flex h-[48px] w-full items-center justify-between rounded-[22px] border border-white/16 bg-white/10 px-4 text-sm text-white outline-none transition hover:bg-white/14"
            }
          >
            <span className="truncate">{selectedLabel}</span>
            {disabled ? null : <ChevronDown className="ml-4 h-4 w-4 shrink-0 text-white/72" />}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] rounded-[22px] border border-white/24 bg-white/12 p-2 text-white shadow-[0_20px_60px_rgba(15,5,7,0.2)] ring-0 backdrop-blur-2xl"
        >
          <div
            className="crm-touch-scroll max-h-[280px] space-y-1 overflow-y-auto pr-1 [scrollbar-color:rgba(255,255,255,0.32)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/28 hover:[&::-webkit-scrollbar-thumb]:bg-white/40"
            data-lenis-prevent
            data-lenis-prevent-touch
            data-lenis-prevent-wheel
          >
            {options.map((option) => {
              const active = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={
                    active
                      ? "w-full rounded-[14px] border border-white/30 bg-white/90 px-4 py-2.5 text-left text-sm text-black shadow-[0_6px_20px_rgba(255,255,255,0.12)]"
                      : "w-full rounded-[14px] px-4 py-2.5 text-left text-sm text-white/88 transition hover:bg-white/16 hover:text-white"
                  }
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

type AdNameSearchInputProps = {
  id: string;
  suggestions: string[];
  onSearchChange: (value: string) => void;
};

const AdNameSearchInput = React.memo(function AdNameSearchInput({
  id,
  suggestions,
  onSearchChange,
}: AdNameSearchInputProps) {
  const [inputValue, setInputValue] = React.useState("");
  const deferredInputValue = React.useDeferredValue(inputValue);
  const autocompleteSuggestion = React.useMemo(
    () => findAutocompleteSuggestion(suggestions, inputValue),
    [inputValue, suggestions],
  );

  React.useEffect(() => {
    onSearchChange(deferredInputValue);
  }, [deferredInputValue, onSearchChange]);

  function acceptAutocompleteSuggestion() {
    if (!autocompleteSuggestion) return;
    setInputValue(autocompleteSuggestion);
  }

  function acceptAutocompleteWord() {
    if (!autocompleteSuggestion) return;

    const nextChunk = getAutocompleteWordChunk(autocompleteSuggestion, inputValue);
    if (!nextChunk) return;

    setInputValue(`${inputValue}${nextChunk}`);
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>Search Ad Name</FieldLabel>
      <div className="relative h-[48px] rounded-[22px] border border-white/16 bg-white/10">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/44" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-4 left-11 flex items-center overflow-hidden text-md leading-none"
        >
          {inputValue ? (
            <>
              <span className="whitespace-pre text-white">{inputValue}</span>
              {autocompleteSuggestion ? (
                <span className="truncate whitespace-pre text-white/38">
                  {autocompleteSuggestion.slice(inputValue.length)}
                </span>
              ) : null}
            </>
          ) : null}
        </div>
        <input
          id={id}
          name={id}
          type="text"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            const selectionAtEnd =
              event.currentTarget.selectionStart === event.currentTarget.value.length &&
              event.currentTarget.selectionEnd === event.currentTarget.value.length;

            if (!autocompleteSuggestion || !selectionAtEnd) return;

            if (event.key === "Enter" || event.key === "Tab" || event.key === "ArrowRight") {
              event.preventDefault();
              acceptAutocompleteSuggestion();
              return;
            }

            if (event.key === " ") {
              event.preventDefault();
              acceptAutocompleteWord();
            }
          }}
          placeholder="Type ad name..."
          autoComplete="off"
          spellCheck={false}
          className="relative z-10 h-[48px] w-full rounded-[22px] bg-transparent pl-11 pr-4 text-sm leading-none text-transparent caret-white outline-none placeholder:text-white/34"
        />
      </div>
    </Field>
  );
});

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatCurrencyAmount(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function renderTooltipRow(label: string, value: number, accentClass = "text-white") {
  return (
    <div className="flex items-center justify-between gap-6 text-sm">
      <span className="text-white/68">{label}</span>
      <span className={`font-semibold tabular-nums ${accentClass}`}>{formatCompactNumber(value)}</span>
    </div>
  );
}

function TimelineTooltip({
  active,
  payload,
  activeBrand,
}: {
  active?: boolean;
  payload?: Array<{ payload: TimelineDatum }>;
  activeBrand: Brand;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  const tooltipBg = activeBrand === "bigwing" ? "bg-[#1a1a1a]/95" : "bg-[#1e3f62]/95";

  return (
    <div className={`min-w-[200px] rounded-[22px] border border-white/24 ${tooltipBg} px-5 py-4 text-white shadow-[0_8px_32px_rgba(255,255,255,0.08),0_20px_60px_rgba(0,0,0,0.35)] ring-0 backdrop-blur-2xl`}>
      <div className="pb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/52">
        {point.tooltipHeading}
      </div>
      <div className="text-base font-bold text-white">{point.tooltipLabel}</div>
      <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
        {activeBrand !== "redwing" ? renderTooltipRow("Bigwing", point.bigwingLeads, "text-white") : null}
        {activeBrand !== "bigwing" ? renderTooltipRow("Redwing", point.redwingLeads, "text-white") : null}
        {renderTooltipRow("Total", point.leads, "text-white")}
      </div>
    </div>
  );
}

function PlatformTooltip({
  active,
  payload,
  activeBrand,
}: {
  active?: boolean;
  payload?: Array<{ payload: PlatformDatum }>;
  activeBrand: Brand;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  const tooltipBg = activeBrand === "bigwing" ? "bg-[#1a1a1a]/95" : "bg-[#1e3f62]/95";

  return (
    <div className={`min-w-[200px] rounded-[22px] border border-white/24 ${tooltipBg} px-5 py-4 text-white shadow-[0_8px_32px_rgba(255,255,255,0.08),0_20px_60px_rgba(0,0,0,0.35)] ring-0 backdrop-blur-2xl`}>
      <div className="pb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/52">
        Platform / Source
      </div>
      <div className="text-base font-bold text-white">{point.name}</div>
      <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
        {activeBrand !== "redwing" ? renderTooltipRow("Bigwing", point.bigwingValue, "text-white") : null}
        {activeBrand !== "bigwing" ? renderTooltipRow("Redwing", point.redwingValue, "text-white") : null}
        {renderTooltipRow("Total", point.value, "text-white")}
      </div>
    </div>
  );
}

function GlassMetricTooltip({
  active,
  label,
  payload,
  labelHeading,
  activeBrand,
}: {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ value?: number; name?: string }>;
  labelHeading: string;
  activeBrand?: Brand;
}) {
  if (!active || !payload?.length) return null;

  const item = payload[0];
  const value = typeof item?.value === "number" ? item.value : Number(item?.value ?? 0);
  const valueLabel = item?.name ?? "Value";
  const tooltipBg = activeBrand === "bigwing" ? "bg-[#1a1a1a]/95" : "bg-[#1e3f62]/95";

  return (
    <div className={`min-w-[200px] rounded-[22px] border border-white/24 ${tooltipBg} px-5 py-4 text-white shadow-[0_8px_32px_rgba(255,255,255,0.08),0_20px_60px_rgba(0,0,0,0.35)] ring-0 backdrop-blur-2xl`}>
      <div className="pb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/52">
        {labelHeading}
      </div>
      <div className="text-base font-bold text-white">{label}</div>
      <div className="mt-3 border-t border-white/10 pt-3">
        {renderTooltipRow(valueLabel, value, "text-white")}
      </div>
    </div>
  );
}

function findAutocompleteSuggestion(options: string[], query: string) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return "";

  const normalizedQuery = trimmedQuery.toLowerCase();
  const searchableQuery = normalizedQuery.replace(/[^a-z0-9]+/g, "");

  return (
    options.find((option) => {
      const normalizedOption = option.toLowerCase();
      const searchableOption = normalizedOption.replace(/[^a-z0-9]+/g, "");

      return (
        searchableOption.startsWith(searchableQuery) &&
        searchableOption !== searchableQuery &&
        normalizedOption !== normalizedQuery
      );
    }) ?? ""
  );
}

function getAutocompleteWordChunk(suggestion: string, query: string) {
  if (!suggestion || suggestion.length <= query.length) return "";

  const remainingSuggestion = suggestion.slice(query.length);
  const nextWordMatch = remainingSuggestion.match(/^\S+\s*/);

  return nextWordMatch?.[0] ?? remainingSuggestion;
}

function parseDate(date: string | null) {
  return date ? new Date(`${date}T00:00:00`) : null;
}

function getIstDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getRowIstDate(row: DashboardRow) {
  const timestamp = getRowTimestamp(row);
  if (timestamp) {
    return getIstDateKey(timestamp);
  }

  return row.date;
}

function getRowTimestampValue(row: DashboardRow) {
  return (
    row.raw.created_time ||
    row.raw.date ||
    row.raw.day ||
    row.raw.reporting_starts ||
    row.raw.start_date ||
    row.date ||
    ""
  );
}

function getRowTimestamp(row: DashboardRow) {
  const rawValue = getRowTimestampValue(row).trim();
  if (!rawValue) return null;

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;
}

function formatHourLabel(hour: number) {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const period = normalizedHour >= 12 ? "PM" : "AM";
  const displayHour = normalizedHour % 12 || 12;
  return `${displayHour}${period}`;
}

function formatHourTooltipLabel(hour: number) {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const period = normalizedHour >= 12 ? "PM" : "AM";
  const displayHour = normalizedHour % 12 || 12;
  return `${displayHour}:00 ${period}`;
}

function getIstHourKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}`;
}

function getIstHourNumber(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  return Number(hour);
}

function isRowInIstDate(row: DashboardRow, targetIstDate: string) {
  const rawValue = getRowTimestampValue(row).trim();
  if (!rawValue) return false;

  const direct = new Date(rawValue);
  if (!Number.isNaN(direct.getTime())) {
    return getIstDateKey(direct) === targetIstDate;
  }

  const normalizedDate = row.date;
  return normalizedDate === targetIstDate;
}

function getUniquePhoneCampaignCount(rows: DashboardRow[]) {
  return new Set(
    rows
      .filter((row) => row.phoneNumber)
      .map((row) => `${row.phoneNumber}::${row.campaign || "unknown"}`),
  ).size;
}

function getLocationLabel(row: DashboardRow, brand: Brand) {
  if (row.brand === "bigwing" && row.location === "yes") {
    return "Bigwing W-field / hoodi";
  }

  if (row.brand === "bigwing" && row.location === "no") {
    return "Bigwing others";
  }

  const location = row.location;

  if (brand !== "all") {
    return location;
  }

  const brandLabel =
    row.brand === "bigwing" ? "bigwing" : row.brand === "redwing" ? "redwing" : "unknown";

  return `${brandLabel} ${location}`;
}

function formatChartLocationLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Unknown";

  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCampaignAxisLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Unknown";

  const words = trimmed.match(/[A-Za-z0-9]+/g) ?? [];
  if (words.length === 0) return trimmed;

  return words.map((word) => word.charAt(0).toUpperCase()).join("");
}

function summarizeRows(rows: DashboardRow[]): Summary {
  const totalLeads = rows.length;
  const uniquePhones = getUniquePhoneCampaignCount(rows);
  const campaigns = new Set(rows.map((row) => row.campaign).filter(Boolean)).size;
  const tabs = new Set(rows.map((row) => row.tabName).filter(Boolean)).size;

  return {
    totalLeads,
    uniquePhones,
    campaigns,
    tabs,
  };
}

function syncBrandMetadata(brand: Brand) {
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

export function DashboardClient({ workbook, initialBrand }: DashboardClientProps) {
  const [isPending, startTransition] = useTransition();
  const [isBrandPending, startBrandTransition] = useTransition();
  const [isMounted, setIsMounted] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(false);

  React.useEffect(() => {
    // Increased delay to 300ms to ensure browser layout is fully stable on hard refresh
    const timer = setTimeout(() => {
      setIsMounted(true);
      // Trigger a resize event to force charts to measure updated layout
      window.dispatchEvent(new Event("resize"));
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const updateIsDesktop = () => setIsDesktop(mediaQuery.matches);

    updateIsDesktop();
    mediaQuery.addEventListener("change", updateIsDesktop);

    return () => {
      mediaQuery.removeEventListener("change", updateIsDesktop);
    };
  }, []);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const autoRefreshTimestampRef = React.useRef(0);
  const [brand, setBrand] = React.useState<Brand>(initialBrand);
  const [campaignFilter, setCampaignFilter] = React.useState("all");
  const [searchFilter, setSearchFilter] = React.useState("");
  const normalizedSearchFilter = searchFilter.trim().toLowerCase();
  const [isDigitalModalOpen, setIsDigitalModalOpen] = React.useState(false);
  const [digitalPin, setDigitalPin] = React.useState("");
  const [isDigitalPinVerified, setIsDigitalPinVerified] = React.useState(false);
  const [isDigitalLoading, setIsDigitalLoading] = React.useState(false);
  const [isWorkbookRefreshing, setIsWorkbookRefreshing] = React.useState(false);
  const [digitalError, setDigitalError] = React.useState<string | null>(null);

  // Lock scroll when digital modal is open
  React.useEffect(() => {
    if (isDigitalModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isDigitalModalOpen]);


  const [digitalMeta, setDigitalMeta] = React.useState<DigitalLeadImportMeta | null>(null);
  const [digitalResponseText, setDigitalResponseText] = React.useState("");
  const [digitalSuccessMessage, setDigitalSuccessMessage] = React.useState("");
  const [metaSpend, setMetaSpend] = React.useState<MetaSpendSummary | null>(null);
  const [metaSpendError, setMetaSpendError] = React.useState<string | null>(null);
  const [isMetaSpendLoading, setIsMetaSpendLoading] = React.useState(false);
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
    from: DASHBOARD_RANGE_START,
    to: new Date(),
  });

  const updateMetadata = React.useEffectEvent((nextBrand: Brand) => {
    syncBrandMetadata(nextBrand);
  });

  React.useEffect(() => {
    updateMetadata(brand);
  }, [brand]);

  React.useEffect(() => {
    if (brand === "all") {
      setCampaignFilter("all");
    }
  }, [brand]);

  const requestWorkbookRefresh = React.useEffectEvent(() => {
    if (typeof document === "undefined" || document.visibilityState !== "visible") {
      return;
    }

    if (isBrandPending || isWorkbookRefreshing) {
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

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        requestWorkbookRefresh();
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  React.useEffect(() => {
    setIsDigitalModalOpen(false);
    setIsDigitalPinVerified(false);
    setDigitalPin("");
    setDigitalError("");
    setDigitalMeta(null);
    setDigitalResponseText("");
    setDigitalSuccessMessage("");
  }, [brand]);

  const brandRows = React.useMemo(
    () =>
      workbook.rows.filter((row) => {
        if (brand === "all") return row.brand !== "unknown";
        return row.brand === brand;
      }),
    [brand, workbook.rows],
  );

  const todayIst = getIstDateKey(new Date());

  const campaigns = React.useMemo(
    () => Array.from(new Set(brandRows.map((row) => row.campaign).filter(Boolean))).sort(),
    [brandRows],
  );

  const autocompleteRows = React.useMemo(() => {
    const fromDate = dateRange?.from;
    const toDate = dateRange?.to;

    return brandRows.filter((row) => {
      const rowDate = parseDate(getRowIstDate(row));
      const from = fromDate ? startOfDay(fromDate) : null;
      const to = toDate ? endOfDay(toDate) : null;
      const outOfRange =
        (from && rowDate && isBefore(rowDate, from)) || (to && rowDate && isAfter(rowDate, to));

      if (outOfRange) return false;
      if (campaignFilter !== "all" && row.campaign !== campaignFilter) return false;

      return Boolean(row.adName);
    });
  }, [brandRows, campaignFilter, dateRange]);

  const adNameSuggestions = React.useMemo(
    () =>
      Array.from(new Set(autocompleteRows.map((row) => row.adName.trim()).filter(Boolean))).sort((left, right) =>
        left.localeCompare(right),
      ),
    [autocompleteRows],
  );

  const filteredRows = React.useMemo(() => {
    const fromDate = dateRange?.from;
    const toDate = dateRange?.to;

    return brandRows.filter((row) => {
      const rowDate = parseDate(getRowIstDate(row));
      const from = fromDate ? startOfDay(fromDate) : null;
      const to = toDate ? endOfDay(toDate) : null;
      const outOfRange =
        (from && rowDate && isBefore(rowDate, from)) || (to && rowDate && isAfter(rowDate, to));

      if (outOfRange) return false;
      if (campaignFilter !== "all" && row.campaign !== campaignFilter) return false;
      if (normalizedSearchFilter && !row.adName.toLowerCase().includes(normalizedSearchFilter)) {
        return false;
      }

      return true;
    });
  }, [brandRows, campaignFilter, dateRange, normalizedSearchFilter]);

  const filteredCampaignNames = React.useMemo(
    () =>
      Array.from(new Set(filteredRows.map((row) => row.campaign).filter(Boolean))).sort((left, right) =>
        left.localeCompare(right),
      ),
    [filteredRows],
  );

  const metaSpendDateRange = React.useMemo(() => {
    const fromDate = dateRange?.from ?? dateRange?.to;
    const toDate = dateRange?.to ?? dateRange?.from;

    if (!fromDate || !toDate) {
      return null;
    }

    return {
      from: getIstDateKey(fromDate),
      to: getIstDateKey(toDate),
    };
  }, [dateRange]);

  const loadMetaSpend = React.useEffectEvent(
    async ({
      campaigns,
      from,
      signal,
      to,
    }: {
      campaigns: string[];
      from: string;
      signal: AbortSignal;
      to: string;
    }) => {
      try {
        const response = await fetch("/api/meta/spend", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            campaigns,
            from,
            to,
          }),
          cache: "no-store",
          signal,
        });
        const data = (await response.json().catch(() => null)) as
          | ({
              ok?: boolean;
              error?: string;
            } & Partial<MetaSpendSummary>)
          | null;

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || "Unable to fetch Meta spend right now.");
        }

        setMetaSpend({
          configured: Boolean(data.configured),
          currency: typeof data.currency === "string" && data.currency ? data.currency : "INR",
          matchedCampaigns: Number(data.matchedCampaigns ?? 0),
          requestedCampaigns: Number(data.requestedCampaigns ?? 0),
          totalSpend: Number(data.totalSpend ?? 0),
        });
        setMetaSpendError(null);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setMetaSpend(null);
        setMetaSpendError(
          error instanceof Error ? error.message : "Unable to fetch Meta spend right now.",
        );
      } finally {
        if (!signal.aborted) {
          setIsMetaSpendLoading(false);
        }
      }
    },
  );

  React.useEffect(() => {
    if (!metaSpendDateRange) {
      setMetaSpend(null);
      setMetaSpendError(null);
      setIsMetaSpendLoading(false);
      return;
    }

    const controller = new AbortController();

    setMetaSpend(null);
    setMetaSpendError(null);
    setIsMetaSpendLoading(true);

    loadMetaSpend({
      campaigns: filteredCampaignNames,
      from: metaSpendDateRange.from,
      signal: controller.signal,
      to: metaSpendDateRange.to,
    });

    return () => {
      controller.abort();
    };
  }, [filteredCampaignNames, metaSpendDateRange]);

  const filteredDigitalLeads = React.useMemo(() => {
    const fromDate = dateRange?.from;
    const toDate = dateRange?.to;
    const from = fromDate ? startOfDay(fromDate) : null;
    const to = toDate ? endOfDay(toDate) : null;

    return (workbook.digitalLeads || []).filter((entry) => {
      const d = parseDate(entry.date);
      if (!d) return false;
      return (!from || !isBefore(d, from)) && (!to || !isAfter(d, to));
    });
  }, [workbook.digitalLeads, dateRange]);

  const summary = React.useMemo(() => summarizeRows(filteredRows), [filteredRows]);

  const spendCardValue = React.useMemo(() => {
    if (isMetaSpendLoading) {
      return "...";
    }

    if (!metaSpend?.configured) {
      return "--";
    }

    return formatCurrencyAmount(metaSpend.totalSpend, metaSpend.currency);
  }, [isMetaSpendLoading, metaSpend]);

  const spendCardHint = React.useMemo(() => {
    if (isMetaSpendLoading) {
      return "Fetching live Meta spend.";
    }

    if (metaSpendError) {
      return metaSpendError;
    }

    if (!metaSpend?.configured) {
      return "Add META_ACCESS_TOKEN to enable spend.";
    }

    if (metaSpend.requestedCampaigns === 0) {
      return "No campaigns match the current filters.";
    }

    return `${metaSpend.matchedCampaigns} matching campaign${metaSpend.matchedCampaigns === 1 ? "" : "s"} from Meta`;
  }, [isMetaSpendLoading, metaSpend, metaSpendError]);

  const todayCampaignRows = React.useMemo(
    () =>
      brandRows.filter((row) => {
        if (!isRowInIstDate(row, todayIst)) return false;
        if (normalizedSearchFilter && !row.adName.toLowerCase().includes(normalizedSearchFilter)) {
          return false;
        }

        return true;
      }),
    [brandRows, normalizedSearchFilter, todayIst],
  );

  const todayCampaignData = Array.from(
    todayCampaignRows.reduce<Map<string, number>>((map, row) => {
      const key = row.campaign || "Unknown";
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  )
    .map(([campaign, leads]) => ({ campaign, leads }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 2);

  const currentRangeFrom = dateRange?.from;
  const currentRangeTo = dateRange?.to;
  const isSingleDayRange = !!(
    currentRangeFrom &&
    currentRangeTo &&
    getIstDateKey(currentRangeFrom) === getIstDateKey(currentRangeTo)
  );
  const selectedIstDateKey = isSingleDayRange && currentRangeFrom ? getIstDateKey(currentRangeFrom) : null;
  const todayIstKey = getIstDateKey(new Date());
  const isTodaySingleDayRange = selectedIstDateKey === todayIstKey;

  const timelineData = React.useMemo(() => {
    if (isSingleDayRange && selectedIstDateKey) {
      const timelineMap = new Map<string, TimelineDatum>();

      for (const row of filteredRows) {
        const timestamp = getRowTimestamp(row);
        if (!timestamp) continue;
        if (getIstDateKey(timestamp) !== selectedIstDateKey) continue;

        const key = getIstHourKey(timestamp);
        const hour = getIstHourNumber(timestamp);
        const bucket = timelineMap.get(key) ?? {
          date: key,
          label: formatHourLabel(hour),
          tooltipLabel: formatHourTooltipLabel(hour),
          tooltipHeading: "Time",
          leads: 0,
          bigwingLeads: 0,
          redwingLeads: 0,
        };
        bucket.leads += 1;
        if (row.brand === "bigwing") bucket.bigwingLeads += 1;
        if (row.brand === "redwing") bucket.redwingLeads += 1;
        timelineMap.set(key, bucket);
      }

      const hourLimit = isTodaySingleDayRange ? getIstHourNumber(new Date()) : 23;
      const buckets = [];

      for (let hour = 0; hour <= hourLimit; hour += 1) {
        const date = `${selectedIstDateKey} ${String(hour).padStart(2, "0")}`;
        buckets.push(
          timelineMap.get(date) ?? {
            date,
            label: formatHourLabel(hour),
            tooltipLabel: formatHourTooltipLabel(hour),
            tooltipHeading: "Time",
            leads: 0,
            bigwingLeads: 0,
            redwingLeads: 0,
          },
        );
      }

      return buckets;
    }

    const timelineMap = new Map<string, TimelineDatum>();
    for (const row of filteredRows) {
      const key = row.date ?? "Unknown";
      const bucket = timelineMap.get(key) ?? {
        date: key,
        label: key.slice(8, 10),
        tooltipLabel: key,
        tooltipHeading: "Date",
        leads: 0,
        bigwingLeads: 0,
        redwingLeads: 0,
      };
      bucket.leads += 1;
      if (row.brand === "bigwing") bucket.bigwingLeads += 1;
      if (row.brand === "redwing") bucket.redwingLeads += 1;
      timelineMap.set(key, bucket);
    }

    return Array.from(timelineMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredRows, isSingleDayRange, isTodaySingleDayRange, selectedIstDateKey]);

  const timelineTickInterval = Math.max(0, Math.ceil(timelineData.length / 6) - 1);

  const campaignMap = new Map<string, number>();
  const platformMap = new Map<string, { total: number; bigwing: number; redwing: number }>();
  const locationMap = new Map<string, number>();
  const bigwingResponseMap = new Map<string, number>();
  const redwingLocationMap = new Map<string, number>();

  for (const row of filteredRows) {
    campaignMap.set(row.campaign || "Unknown", (campaignMap.get(row.campaign || "Unknown") ?? 0) + 1);
    const platformKey = row.platform || "unknown";
    const platformBucket = platformMap.get(platformKey) ?? { total: 0, bigwing: 0, redwing: 0 };
    platformBucket.total += 1;
    if (row.brand === "bigwing") platformBucket.bigwing += 1;
    if (row.brand === "redwing") platformBucket.redwing += 1;
    platformMap.set(platformKey, platformBucket);
    if (row.location) {
      const label = getLocationLabel(row, brand);
      locationMap.set(label, (locationMap.get(label) ?? 0) + 1);
    }
    if (row.brand === "bigwing" && (row.location === "yes" || row.location === "no")) {
      bigwingResponseMap.set(row.location, (bigwingResponseMap.get(row.location) ?? 0) + 1);
    }
    if (row.brand === "redwing" && row.location) {
      redwingLocationMap.set(row.location, (redwingLocationMap.get(row.location) ?? 0) + 1);
    }
  }

  const campaignData = Array.from(campaignMap.entries())
    .map(([campaign, leads]) => ({ campaign, leads }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 8);

  const platformData = Array.from(platformMap.entries())
    .map(([name, value]) => ({
      name: name.toUpperCase(),
      value: value.total,
      bigwingValue: value.bigwing,
      redwingValue: value.redwing,
    }))
    .sort((a, b) => b.value - a.value);

  const bigwingResponseData = Array.from(bigwingResponseMap.entries())
    .map(([response, leads]) => ({ response, leads }))
    .sort((a, b) => b.leads - a.leads);


  const redwingLocationData = Array.from(redwingLocationMap.entries())
    .map(([location, leads]) => ({ location: formatChartLocationLabel(location), leads }))
    .sort((a, b) => b.leads - a.leads);

  const redwingLocationChartHeight = Math.max(
    brand === "redwing" ? 180 : 220,
    redwingLocationData.length * (brand === "redwing" ? 32 : 42),
  );

  const chartPrimary = "#ffffff";
  const chartAccent = "#8de0ff";
  const chartHoverCursor = "rgba(216, 216, 216, 0.1)";
  const pieColors = ["#ffffff", "#8de0ff", "#eefbff", "#d8f3ff", "#b9eaff"];

  async function handleLogout() {
    startTransition(async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      router.refresh();
    });
  }

  async function handleDigitalPinSubmit() {
    setIsDigitalLoading(true);
    setDigitalError("");
    setDigitalSuccessMessage("");

    try {
      const response = await fetch("/api/digital/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pin: digitalPin }),
      });

      const data = (await response.json().catch(() => null)) as
        | ({ ok: true } & DigitalLeadImportMeta)
        | { ok: false; error?: string }
        | null;

      if (!response.ok || !data || data.ok !== true) {
        if (response.status === 404) {
          setDigitalError("Importer API not found. Please restart the server.");
          return;
        }
        setDigitalError(data && "error" in data ? data.error ?? "Wrong digital PIN." : "Wrong digital PIN.");
        return;
      }

      setDigitalMeta({
        lastImportedDate: data.lastImportedDate,
        prompt: data.prompt,
      });
      setIsDigitalPinVerified(true);
    } finally {
      setIsDigitalLoading(false);
    }
  }

  async function handleCopyDigitalPrompt() {
    if (!digitalMeta?.prompt) return;

    try {
      await navigator.clipboard.writeText(digitalMeta.prompt);
      setDigitalSuccessMessage("Prompt copied. Paste it into ChatGPT with your image.");
      setDigitalError("");
    } catch {
      setDigitalError("Unable to copy prompt right now.");
    }
  }

  async function handleDigitalImportSubmit() {
    setIsDigitalLoading(true);
    setDigitalError("");
    setDigitalSuccessMessage("");

    try {
      const parsed = JSON.parse(digitalResponseText) as { entries?: unknown[] };

      const response = await fetch("/api/digital/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pin: digitalPin,
          promptUsed: digitalMeta?.prompt ?? "",
          payload: parsed,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { ok: true; count: number }
        | { ok: false; error?: string }
        | null;

      if (!response.ok || !data || data.ok !== true) {
        setDigitalError(
          data && "error" in data ? data.error ?? "Unable to import the pasted JSON." : "Unable to import the pasted JSON.",
        );
        return;
      }

      setDigitalSuccessMessage(`${data.count} row${data.count === 1 ? "" : "s"} appended to DATA.`);
      setDigitalResponseText("");
      const refreshedMeta = await fetch("/api/digital/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pin: digitalPin }),
      });
      const refreshedData = (await refreshedMeta.json().catch(() => null)) as
        | ({ ok: true } & DigitalLeadImportMeta)
        | null;

      if (refreshedMeta.ok && refreshedData?.ok) {
        setDigitalMeta({
          lastImportedDate: refreshedData.lastImportedDate,
          prompt: refreshedData.prompt,
        });
      }
    } catch {
      setDigitalError("Paste valid JSON from ChatGPT before importing.");
    } finally {
      setIsDigitalLoading(false);
    }
  }

  async function handleWorkbookRefresh() {
    if (isWorkbookRefreshing) {
      return;
    }

    setIsWorkbookRefreshing(true);
    setDigitalError("");
    setDigitalSuccessMessage("");

    try {
      const response = await fetch("/api/workbook/refresh", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Unable to refresh workbook data right now.");
      }

      setDigitalSuccessMessage("Workbook data refreshed from Google Sheets.");
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setDigitalError(
        error instanceof Error ? error.message : "Unable to refresh workbook data right now.",
      );
    } finally {
      setIsWorkbookRefreshing(false);
    }
  }

  function openDigitalModal() {
    setIsDigitalModalOpen(true);
    setDigitalError("");
    setDigitalSuccessMessage("");
  }

  function closeDigitalModal() {
    setIsDigitalModalOpen(false);
    setDigitalError("");
    setDigitalSuccessMessage("");
  }

  function handleBrandChange(nextBrand: Brand) {
    if (nextBrand === brand || isBrandPending) {
      return;
    }

    startBrandTransition(() => {
      setBrand(nextBrand);
      const nextSearch = new URLSearchParams(searchParams.toString());
      nextSearch.set("brand", nextBrand);
      router.replace(`${pathname}?${nextSearch.toString()}`, { scroll: false });
    });
  }

  function handleOpenLeadsTable() {
    startTransition(() => router.push(leadsPageHref));
  }

  const activeBrandAssets = getBrandAssets(brand);
  const leadsPageHref = `/leads?brand=${brand === "all" ? "bigwing" : brand}`;
  const dashboardBackground = brand === "bigwing" ? "#000000" : "#0D4D8B";
  const redwingLocationAxisWidth = isDesktop ? 118 : 80;
  const redwingLocationAxisFontSize = isDesktop ? 14 : 10;
  const redwingLocationChartMargin = isDesktop ? { left: 0, right: 0 } : { left: -12, right: 0 };

  return (
    <div
      className="min-h-screen text-white transition-[background-color] duration-500 ease-out"
      style={{ backgroundColor: dashboardBackground }}
    >
      <div className="min-h-screen">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-8 px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
          <section className="relative crm-surface-radius border border-white/14 bg-white/10 p-4 sm:p-5 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-white/65">
                  <Sparkles className="h-3.5 w-3.5" />
                  {brand === "all" ? "Combined Dashboard" : `${activeBrandAssets.label} Dashboard`}
                </div>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Campaign analytics</h1>
                <p className="mt-1 sm:mt-2 max-w-3xl text-xs sm:text-sm text-white/68">
                  Auto-detected {workbook.tabs.length} campaign tabs from Google Sheets with lead analytics by campaign,
                  ad name, platform, location, and lead status.
                </p>
                {workbook.error ? (
                  <p className="mt-3 rounded-2xl border border-[#ffb4b4]/20 bg-[#ffb4b4]/8 px-4 py-3 text-sm text-[#ffe2e2]">
                    {workbook.error}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 lg:min-h-[132px] lg:items-end lg:justify-between">
                <div className="flex flex-wrap items-center justify-center lg:justify-end gap-2">
                  {brandOptions.map((option) => {
                    const selected = option === brand;
                    const label = option === "all" ? "All" : BRAND_CONFIG[option].label;
                    const loading = isBrandPending && selected;

                    return (
                      <Button
                        key={option}
                        variant="ghost"
                        aria-busy={loading}
                        className={
                          selected
                            ? "min-w-[80px] gap-2 sm:min-w-[104px] rounded-full border border-white/70 bg-white px-3 sm:px-5 py-1 text-xs sm:text-sm font-medium text-black shadow-[0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl hover:bg-white hover:text-black"
                            : "min-w-[80px] gap-2 sm:min-w-[104px] rounded-full border border-white/10 bg-white/6 px-3 sm:px-5 py-1 text-xs sm:text-sm text-white/62 shadow-none backdrop-blur-xl hover:bg-white/10 hover:text-white"
                        }
                        onClick={() => handleBrandChange(option)}
                      >
                        {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                        {label}
                      </Button>
                    );
                  })}
                </div>

                <div className="flex justify-center lg:justify-end">
                  <div className="flex items-center gap-2">
                    {brand === "redwing" ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full border border-white/12 bg-white/8 text-white/82 shadow-none backdrop-blur-xl hover:bg-white/8 hover:text-white absolute top-4 right-16 lg:static sm:right-24 md:right-32 lg:right-auto"
                        onClick={openDigitalModal}
                        aria-label="Open digital leads importer"
                      >
                        <FileUp className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full border border-white/12 bg-white/8 text-white/82 shadow-none backdrop-blur-xl hover:bg-white/8 hover:text-white absolute top-4 right-4 lg:static lg:w-auto lg:h-auto lg:px-5 lg:py-1 lg:gap-2"
                      onClick={handleLogout}
                    >
                      <LogOut className="h-4 w-4" />
                      <span className="hidden lg:inline">Logout</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:gap-4 crm-surface-radius border border-white/14 bg-white/10 p-5 backdrop-blur-2xl lg:grid-cols-[1.2fr_0.9fr_1.8fr]">
            <DateRangePicker date={dateRange} onSelect={setDateRange} brand={brand} />

            <FilterSelect
              id="campaign-filter"
              label="Campaign"
              value={campaignFilter}
              onChange={setCampaignFilter}
              disabled={brand === "all"}
              options={[{ value: "all", label: "All campaigns" }, ...campaigns.map((campaign) => ({ value: campaign, label: campaign }))]}
            />

            <AdNameSearchInput id="ad-search" suggestions={adNameSuggestions} onSearchChange={setSearchFilter} />
          </section>

          <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {[
              { label: "Total Leads", value: formatCompactNumber(summary.totalLeads), hint: "Filtered lead rows", icon: Users },
              { label: "Unique Phones", value: formatCompactNumber(summary.uniquePhones), hint: "Distinct phone + campaign pairs", icon: Target },
              { label: "Campaigns", value: formatCompactNumber(summary.campaigns), hint: `${summary.tabs} active tabs`, icon: Layers3 },
              { label: "Cost Spent", value: spendCardValue, hint: spendCardHint, icon: IndianRupee },
            ].map((card) => (
              <div key={card.label} className="crm-surface-radius border border-white/14 bg-white/10 p-3.5 sm:p-4 sm:p-5 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-xl transition-all">
                <div className="mb-2 sm:mb-3 sm:mb-6 flex items-center justify-between">
                  <span className="text-[11px] sm:text-sm text-white/62 uppercase tracking-tight">{card.label}</span>
                  <div className="flex h-7 w-7 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-2xl border border-white/12 bg-white/10">
                    <card.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </div>
                </div>
                <div className="text-xl sm:text-3xl font-semibold tracking-tight tabular-nums">{card.value}</div>
                <p className="mt-0.5 sm:mt-2 text-[10px] sm:text-sm text-white/54 leading-none sm:leading-normal">{card.hint}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-3 sm:gap-4 xl:grid-cols-[1.4fr_1fr]">
            <div className="crm-surface-radius border border-white/14 bg-white/10 p-4 sm:p-5 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
              <div className="mb-3 sm:mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Lead timeline</h2>
                  <p className="mt-1 text-sm text-white/58">
                    {isSingleDayRange ? "Hourly lead volume from `created_time`." : "Daily lead volume from `created_time`."}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label="Timeline instructions"
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/76 transition hover:bg-white/12 hover:text-white"
                      >
                        <CircleAlert className="h-4 w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="w-[320px] rounded-[22px] border border-white/28 bg-white/14 p-4 text-white shadow-[0_20px_60px_rgba(15,5,7,0.2)] ring-0 backdrop-blur-2xl"
                    >
                      <div className="space-y-3">
                        <div>
                          <h3 className="text-sm font-semibold text-white">How timeline counts work</h3>
                          <p className="mt-1 text-xs leading-5 text-white/68">
                            All dates and times are converted to IST first, then grouped into the selected bucket.
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/52">Date Range</p>
                          <p className="mt-1 text-xs leading-5 text-white/76">
                            If you select <span className="font-semibold text-white">15 Apr - 16 Apr</span>, the chart counts leads from
                            <span className="font-semibold text-white"> 15 Apr 12:00 AM IST</span> to
                            <span className="font-semibold text-white"> 16 Apr 11:59 PM IST</span>.
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/52">Time Bucket</p>
                          <p className="mt-1 text-xs leading-5 text-white/76">
                            A point at <span className="font-semibold text-white">5:00 PM</span> means all leads from
                            <span className="font-semibold text-white"> 5:00:00 PM</span> to
                            <span className="font-semibold text-white"> 5:59:59 PM IST</span>. It does not include anything after
                            <span className="font-semibold text-white"> 6:00 PM</span>.
                          </p>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="ghost"
                    className="shrink-0 rounded-full border border-white/12 bg-white/8 px-4 py-1 text-xs sm:text-sm text-white/82 shadow-none backdrop-blur-xl hover:bg-white/8 hover:text-white"
                    onClick={handleOpenLeadsTable}
                    disabled={isPending}
                  >
                    {isPending ? "Loading..." : "Open leads"}
                  </Button>
                </div>
              </div>
                <div className="crm-gpu-layer h-[320px] min-w-0">
                  {isMounted ? (
                    <ResponsiveContainer id="timeline-chart" width="100%" height={320} minWidth={0} minHeight={0}>
                      <LineChart data={timelineData}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          stroke="rgba(255,255,255,0.5)"
                          interval={timelineTickInterval}
                          minTickGap={24}
                          tickFormatter={(value) => timelineData.find((d) => d.date === value)?.label ?? ""}
                        />
                        <YAxis stroke="rgba(255,255,255,0.5)" width={30} tick={{ fontSize: 10 }} />
                        <Tooltip content={<TimelineTooltip activeBrand={brand} />} wrapperStyle={{ zIndex: 9999 }} />
                        <Legend />
                        <Line type="monotone" dataKey="leads" stroke={chartPrimary} strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : null}
                </div>
            </div>

            <div className="crm-surface-radius border border-white/14 bg-white/10 p-4 sm:p-5 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
              <div className="mb-3 sm:mb-6">
                <h2 className="text-xl font-semibold">Platform mix</h2>
                <p className="mt-1 text-sm text-white/58">Lead split by platform values from your sheet.</p>
              </div>
                <div className="crm-gpu-layer h-[320px] min-w-0">
                  {isMounted ? (
                    <ResponsiveContainer id="platform-chart" width="100%" height={320} minWidth={0} minHeight={0}>
                      <PieChart>
                        <Pie
                          data={platformData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={70}
                          outerRadius={104}
                          paddingAngle={2}
                          cornerRadius={3}
                          stroke="none"
                        >
                          {platformData.map((entry, index) => (
                            <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<PlatformTooltip activeBrand={brand} />} wrapperStyle={{ zIndex: 9999 }} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : null}
                </div>
            </div>
          </section>

          <section className="grid items-start gap-3 sm:gap-4 xl:grid-cols-[1.15fr_1fr]">
            <div className="grid gap-4">
              <div className="crm-surface-radius border border-white/14 bg-white/10 p-4 sm:p-5 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
                <div className="mb-3 sm:mb-6">
                  <h2 className="text-xl font-semibold">Top campaigns</h2>
                  <p className="mt-1 text-sm text-white/58">Lead count by campaign name.</p>
                </div>
                <div className={`crm-gpu-layer ${brand === "redwing" ? "h-[390px]" : "h-[330px]"} min-w-0`}>
                  {isMounted ? (
                    <ResponsiveContainer id="campaign-chart" width="100%" height={brand === "redwing" ? 390 : 330} minWidth={0} minHeight={0}>
                      <BarChart data={campaignData}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis
                          dataKey="campaign"
                          stroke="rgba(255,255,255,0.5)"
                          interval={0}
                          tick={{ fontSize: 10 }}
                          tickFormatter={formatCampaignAxisLabel}
                        />
                        <YAxis stroke="rgba(255,255,255,0.5)" width={30} tick={{ fontSize: 10 }} />
                        <Tooltip
                          content={<GlassMetricTooltip labelHeading="Campaign" activeBrand={brand} />}
                          cursor={{ fill: chartHoverCursor }}
                          wrapperStyle={{ zIndex: 9999 }}
                        />
                        <Legend />
                        <Bar dataKey="leads" fill={chartPrimary} radius={[12, 12, 0, 0]} activeBar={{ stroke: "none" }} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : null}
                </div>
              </div>

              {brand === "all" ? (
                <div className="crm-surface-radius border border-white/14 bg-white/10 p-4 sm:p-5 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold">Today Campaign Leads</h2>
                    <p className="mt-1 text-sm text-white/58">
                      New leads by campaign for today, from 12:00 AM to 11:59 PM IST.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {todayCampaignData.length > 0 ? (
                      todayCampaignData.map((item) => (
                        <div
                          key={item.campaign}
                          className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/6 px-4 py-3"
                        >
                          <span className="pr-4 text-sm text-white/88">{item.campaign}</span>
                          <span className="shrink-0 text-base font-semibold text-white">
                            {formatCompactNumber(item.leads)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-5 text-sm text-white/58">
                        No leads found for today in IST.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

            </div>

            <div className="grid gap-4">
              {brand !== "redwing" ? (
                <div className="crm-surface-radius border border-white/14 bg-white/10 p-4 sm:p-5 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
                  <div className="mb-3 sm:mb-6">
                    <h2 className="text-xl font-semibold">Bigwing Yes / No</h2>
                    <p className="mt-1 text-sm text-white/58">Response count from the Bigwing whitefield / hoodi question.</p>
                  </div>
                  <div className="crm-gpu-layer h-[160px] min-w-0">
                    {bigwingResponseData.length > 0 ? (
                      isMounted ? (
                        <ResponsiveContainer id="bigwing-chart" width="100%" height={160} minWidth={0} minHeight={0}>
                          <BarChart
                            data={bigwingResponseData}
                            layout="vertical"
                            margin={{ left: 0, right: 0 }}
                          >
                            <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                            <XAxis type="number" stroke="rgba(255,255,255,0.5)" />
                            <YAxis dataKey="response" type="category" width={30} stroke="rgba(255,255,255,0.5)" interval={0} tick={{ fontSize: 10 }} />
                            <Tooltip
                              content={<GlassMetricTooltip labelHeading="Response" activeBrand={brand} />}
                              cursor={{ fill: chartHoverCursor }}
                              wrapperStyle={{ zIndex: 9999 }}
                            />
                            <Bar dataKey="leads" fill={chartPrimary} radius={[0, 12, 12, 0]} activeBar={{ stroke: "none" }} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : null
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white/58">
                        No Bigwing yes / no values found in the filtered rows.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {brand !== "bigwing" ? (
                <div className="crm-surface-radius border border-white/14 bg-white/10 p-4 sm:p-5 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
                  <div className="mb-5">
                    <h2 className="text-xl font-semibold">Redwing Locations</h2>
                    <p className="mt-1 text-sm text-white/58">Top Redwing location values from the filtered rows.</p>
                  </div>
                  <div style={{ height: redwingLocationChartHeight }} className="crm-gpu-layer min-w-0">
                    {redwingLocationData.length > 0 ? (
                      isMounted ? (
                        <ResponsiveContainer id="redwing-chart" width="100%" height={redwingLocationChartHeight} minWidth={0} minHeight={0}>
                          <BarChart
                            data={redwingLocationData}
                            layout="vertical"
                            barSize={brand === "redwing" ? 18 : 28}
                            margin={redwingLocationChartMargin}
                          >
                            <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                            <XAxis type="number" stroke="rgba(255,255,255,0.5)" />
                            <YAxis
                              dataKey="location"
                              type="category"
                              width={redwingLocationAxisWidth}
                              stroke="rgba(255,255,255,0.5)"
                              interval={0}
                              tick={{ fontSize: redwingLocationAxisFontSize }}
                            />
                            <Tooltip
                              content={<GlassMetricTooltip labelHeading="Location" activeBrand={brand} />}
                              cursor={{ fill: chartHoverCursor }}
                              wrapperStyle={{ zIndex: 9999 }}
                            />
                            <Bar dataKey="leads" fill={chartAccent} radius={[0, 12, 12, 0]} activeBar={{ stroke: "none" }} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : null
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white/58">
                        No Redwing location values found in the filtered rows.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {brand !== "all" ? (
                <div className="crm-surface-radius border border-white/14 bg-white/10 p-4 sm:p-5 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
                  <div className="mb-3 sm:mb-6">
                    <h2 className="text-xl font-semibold">View all leads</h2>
                    <p className="mt-1 text-sm text-white/58">
                      Open a searchable glass table for every {BRAND_CONFIG[brand].label} lead.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    className="rounded-full border border-white/12 bg-white/8 px-5 py-1 text-white/82 shadow-none backdrop-blur-xl hover:bg-white/8 hover:text-white"
                    onClick={handleOpenLeadsTable}
                    disabled={isPending}
                  >
                    {isPending ? "Loading..." : "Open leads table"}
                  </Button>
                </div>
              ) : null}

            </div>
          </section>

          {brand === "redwing" ? (
            <div className="crm-surface-radius border border-white/14 bg-white/10 p-4 sm:p-5 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
              <div className="mb-3 sm:mb-6">
                <h2 className="text-xl font-semibold">Digital performance</h2>
                <p className="mt-1 text-sm text-white/58">
                  Trends for actual numbers, contacted, and interested leads over time.
                </p>
              </div>
              <div className="crm-gpu-layer h-[340px] min-w-0">
                {isMounted ? (
                  <ResponsiveContainer id="digital-performance-chart" width="100%" height={340}>
                    <LineChart data={filteredDigitalLeads}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke="rgba(255,255,255,0.5)"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(val) => val.split("-").slice(1).join("/")}
                      />
                      <YAxis stroke="rgba(255,255,255,0.5)" width={30} tick={{ fontSize: 10 }} />
                      <Tooltip
                        allowEscapeViewBox={{ x: false, y: true }}
                        contentStyle={{
                          backgroundColor: "#1a1a1a",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "12px",
                          fontSize: "12px",
                        }}
                        offset={{ x: 0, y: 16 }}
                        reverseDirection={{ x: false, y: true }}
                        wrapperStyle={{ zIndex: 9999 }}
                      />
                      <Legend wrapperStyle={{ fontSize: "10px", marginTop: "10px" }} />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        name="Actual"
                        stroke="#ffffff"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="contacted"
                        name="Contacted"
                        stroke="#8de0ff"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="interested"
                        name="Interested"
                        stroke="#eefbff"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : null}
              </div>
            </div>
          ) : null}

          {isDigitalModalOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm">
              <div className="w-full max-w-lg crm-surface-radius border border-white/14 bg-[#103a64] p-8 shadow-[0_40px_120px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-white/65">
                      <FileUp className="h-3.5 w-3.5" />
                      Redwing Digital Import
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold">
                      {isDigitalPinVerified ? "Paste ChatGPT JSON" : "Enter Digital PIN"}
                    </h2>
                    <p className="mt-1 text-sm text-white/68">
                      {isDigitalPinVerified
                        ? "Copy the prompt, use it with your report image in ChatGPT, then paste the JSON response here."
                        : "Use DIGITAL_PIN to unlock the importer before appending anything into DATA."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeDigitalModal}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/82 transition hover:bg-white/12 hover:text-white"
                    aria-label="Close digital import modal"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {!isDigitalPinVerified ? (
                  <div className="space-y-4">
                    <Field>
                      <FieldLabel htmlFor="digital-pin">Digital PIN</FieldLabel>
                      <div className="relative h-[48px] w-full rounded-[22px] border border-white/16 bg-white/10">
                        <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/44" />
                        <input
                          id="digital-pin"
                          type="password"
                          value={digitalPin}
                          onChange={(event) => setDigitalPin(event.target.value)}
                          placeholder="Enter DIGITAL_PIN"
                          className="h-[48px] w-full rounded-[22px] bg-transparent pl-11 pr-4 text-sm text-white outline-none placeholder:text-white/34"
                        />
                      </div>
                    </Field>
                    <div className="flex justify-end gap-3">
                      <Button
                        variant="ghost"
                        className="rounded-full border border-white/12 bg-white/8 px-5 py-1 text-white/82 shadow-none backdrop-blur-xl hover:bg-white/8 hover:text-white"
                        onClick={closeDigitalModal}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="ghost"
                        className="rounded-full border border-white/70 bg-white px-5 py-1 font-medium text-[#103a64] shadow-[0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl hover:bg-white hover:text-[#103a64]"
                        onClick={handleDigitalPinSubmit}
                        disabled={isDigitalLoading || digitalPin.trim().length === 0}
                      >
                        {isDigitalLoading ? "Checking..." : "Unlock importer"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="crm-surface-radius border border-white/12 bg-white/8 p-4">
                      <div className="mb-3 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.22em] text-white/52">Prompt</p>
                          <p className="mt-1 text-sm text-white/68">
                            Last imported date:{" "}
                            <span className="font-semibold text-white">
                              {digitalMeta?.lastImportedDate ?? "No imported rows yet"}
                            </span>
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          className="shrink-0 rounded-full border border-white/12 bg-white/8 px-4 py-1 text-xs text-white/82 shadow-none backdrop-blur-xl hover:bg-white/8 hover:text-white"
                          onClick={handleCopyDigitalPrompt}
                        >
                          <Clipboard className="h-4 w-4" />
                          Copy prompt
                        </Button>
                      </div>
                      <textarea
                        readOnly
                        value={digitalMeta?.prompt ?? ""}
                        className="custom-scrollbar min-h-[132px] w-full resize-none rounded-[20px] border border-white/12 bg-[#0a2744]/70 px-4 py-3 text-sm leading-6 text-white/88 outline-none"
                      />
                    </div>

                    <Field>
                      <FieldLabel htmlFor="digital-json">Paste ChatGPT JSON</FieldLabel>
                      <textarea
                        id="digital-json"
                        value={digitalResponseText}
                        onChange={(event) => setDigitalResponseText(event.target.value)}
                        placeholder='{"entries":[{"date":"2026-04-16","actual":72,"contacted":45,"nonContacted":27,"interested":17}]}'
                        className="custom-scrollbar min-h-[220px] w-full resize-y rounded-[24px] border border-white/16 bg-white/10 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/34"
                      />
                    </Field>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Button
                        variant="ghost"
                        className="rounded-full border border-white/12 bg-white/8 px-5 py-1 text-white/82 shadow-none backdrop-blur-xl hover:bg-white/8 hover:text-white"
                        onClick={handleWorkbookRefresh}
                        disabled={isWorkbookRefreshing}
                      >
                        <RefreshCw className={`h-4 w-4 ${isWorkbookRefreshing ? "animate-spin" : ""}`} />
                        {isWorkbookRefreshing ? "Refreshing..." : "Refresh DATA"}
                      </Button>
                      <div className="flex justify-end gap-3">
                        <Button
                          variant="ghost"
                          className="rounded-full border border-white/12 bg-white/8 px-5 py-1 text-white/82 shadow-none backdrop-blur-xl hover:bg-white/8 hover:text-white"
                          onClick={closeDigitalModal}
                        >
                          Close
                        </Button>
                        <Button
                          variant="ghost"
                          className="rounded-full border border-white/70 bg-white px-5 py-1 font-medium text-[#103a64] shadow-[0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl hover:bg-white hover:text-[#103a64]"
                          onClick={handleDigitalImportSubmit}
                          disabled={isDigitalLoading || digitalResponseText.trim().length === 0}
                        >
                          {isDigitalLoading ? "Appending..." : "Append to DATA"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {digitalError ? (
                  <p className="mt-4 rounded-2xl border border-[#ffb4b4]/20 bg-[#ffb4b4]/8 px-4 py-3 text-sm text-[#ffe2e2]">
                    {digitalError}
                  </p>
                ) : null}
                {digitalSuccessMessage ? (
                  <p className="mt-4 rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm text-white/82">
                    {digitalSuccessMessage}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

        </div>
      </div>
    </div>
  );
}
