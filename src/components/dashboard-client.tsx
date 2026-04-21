"use client";

import { addDays, endOfDay, isAfter, isBefore, startOfDay } from "date-fns";
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
  CircleAlert,
  Clipboard,
  FileUp,
  IndianRupee,
  KeyRound,
  LoaderCircle,
  LogOut,
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
import type {
  DashboardData,
  DashboardDailySummary,
  DashboardPlatformCounts,
  DigitalLeadImportMeta,
} from "@/lib/sheets";

type DashboardClientProps = {
  initialBrand: Brand;
  initialWorkbook?: DashboardData | null;
};

type MetaCampaignSpend = {
  cpc: number;
  currency: string;
  name: string;
  spend: number;
};

type MetaSpendSummary = {
  campaigns: MetaCampaignSpend[];
  configured: boolean;
  currency: string;
  matchedCampaigns: number;
  requestedCampaigns: number;
  totalSpend: number;
};

type DashboardCard = {
  animate?: boolean;
  currency?: string;
  format?: "compact" | "currency";
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  isRefreshing?: boolean;
  label: string;
  numericValue?: number;
  startingValue?: number;
  value: string;
};

type CachedDashboardCard = Pick<
  DashboardCard,
  "currency" | "format" | "label" | "numericValue" | "value"
>;

type DashboardStatCacheBucket = Record<
  string,
  { cards: CachedDashboardCard[]; updatedAt: number }
>;

type DashboardStatCacheStore = Partial<Record<Brand, DashboardStatCacheBucket>>;

type TimelineDatum = {
  bigwingLeads: number;
  date: string;
  fbLeads: number;
  igLeads: number;
  label: string;
  leads: number;
  redwingLeads: number;
  tooltipHeading: string;
  tooltipLabel: string;
};

type PlatformDatum = {
  bigwingValue: number;
  fbValue?: number;
  igValue?: number;
  name: string;
  redwingValue: number;
  value: number;
};

const brandOptions: Brand[] = ["all", "bigwing", "redwing"];
const DASHBOARD_RANGE_START = new Date(new Date().getFullYear(), 3, 1);
const DASHBOARD_STAT_CACHE_KEY = "crm_dashboard_stat_cache_v1";
const DASHBOARD_STAT_CACHE_WRITE_INTERVAL_MS = 5_000;
const META_SPEND_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const EMPTY_DASHBOARD_DATA: DashboardData = {
  campaignAliasesByTab: {},
  dailySummaries: [],
  digitalLeads: [],
  leadCountByTab: {},
  redwingLocationLabels: [],
  tabBrandLookup: {},
  tabLabels: {},
  tabs: [],
};

type FilterSelectProps = {
  disabled?: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
};

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
}: FilterSelectProps) {
  const [open, setOpen] = React.useState(false);
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? label;

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover
        open={disabled ? false : open}
        onOpenChange={disabled ? undefined : setOpen}
      >
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
            {disabled ? null : (
              <ChevronDown className="ml-4 h-4 w-4 shrink-0 text-white/72" />
            )}
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

function DisabledAdNameSearchInput({ id }: { id: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>Search Ad Name</FieldLabel>
      <div className="relative h-[48px] rounded-[22px] border border-white/10 bg-white/6">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <input
          id={id}
          disabled
          placeholder="Ad-level filter unavailable in DATA summary mode"
          className="h-[48px] w-full rounded-[22px] bg-transparent pl-11 pr-4 text-sm text-white/42 outline-none placeholder:text-white/34"
        />
      </div>
    </Field>
  );
}

const DashboardStatCard = React.memo(function DashboardStatCard({
  card,
}: {
  card: DashboardCard;
}) {
  return (
    <div className="crm-surface-radius border border-white/14 bg-white/10 p-3.5 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:p-4">
      <div className="mb-2 flex items-center justify-between sm:mb-4">
        <span className="text-[11px] uppercase tracking-tight text-white/62 sm:text-sm">
          {card.label}
        </span>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/12 bg-white/10 sm:h-10 sm:w-10 sm:rounded-2xl">
          <card.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-xl font-semibold tracking-tight tabular-nums sm:text-3xl">
          {typeof card.numericValue === "number" && card.format ? (
            <AnimatedDashboardValue
              animate={card.animate}
              currency={card.currency}
              format={card.format}
              startingValue={card.startingValue}
              value={card.numericValue}
            />
          ) : (
            card.value
          )}
        </div>
        <div
          className={`h-2 w-2 rounded-full bg-white/60 transition-opacity duration-150 ${
            card.isRefreshing ? "animate-pulse opacity-100" : "opacity-0"
          }`}
        />
      </div>
      <p className="mt-1 text-[10px] leading-none text-white/54 sm:mt-2 sm:text-sm sm:leading-normal">
        {card.hint}
      </p>
    </div>
  );
});

function AnimatedDashboardValue({
  value,
  format,
  currency,
  animate = true,
  startingValue,
}: {
  animate?: boolean;
  value: number;
  format: "compact" | "currency";
  currency?: string;
  startingValue?: number;
}) {
  const initialValue =
    typeof startingValue === "number" && Number.isFinite(startingValue)
      ? startingValue
      : animate
        ? 0
        : value;
  const [displayValue, setDisplayValue] = React.useState(initialValue);
  const displayValueRef = React.useRef(initialValue);

  React.useEffect(() => {
    const nextValue = Number.isFinite(value) ? value : 0;
    const effectiveStartValue =
      typeof startingValue === "number" &&
      Number.isFinite(startingValue) &&
      Math.abs(displayValueRef.current) < 0.01
        ? startingValue
        : displayValueRef.current;
    const startValue = effectiveStartValue;
    const delta = nextValue - startValue;

    if (Math.abs(delta) < 0.01) {
      displayValueRef.current = nextValue;
      setDisplayValue(nextValue);
      return;
    }

    if (!animate) {
      displayValueRef.current = nextValue;
      setDisplayValue(nextValue);
      return;
    }

    const duration = 1100;
    const startTime = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextDisplayValue = startValue + delta * eased;
      displayValueRef.current = nextDisplayValue;
      setDisplayValue(nextDisplayValue);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      } else {
        displayValueRef.current = nextValue;
        setDisplayValue(nextValue);
      }
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [animate, startingValue, value]);

  const formattedValue =
    format === "currency"
      ? formatCurrencyAmount(displayValue, currency)
      : formatCompactNumber(displayValue);

  return <>{formattedValue}</>;
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 0,
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

function readDashboardStatCacheStore(): DashboardStatCacheStore {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(DASHBOARD_STAT_CACHE_KEY);
    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue) as DashboardStatCacheStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDashboardStatCacheStore(store: DashboardStatCacheStore) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(DASHBOARD_STAT_CACHE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage failures so the live dashboard keeps working.
  }
}

function buildDashboardStatCacheKey({
  brand,
  campaignFilter,
  from,
  to,
}: {
  brand: Brand;
  campaignFilter: string;
  from: Date | null | undefined;
  to: Date | null | undefined;
}) {
  return JSON.stringify({
    brand,
    campaignFilter,
    from: from ? getIstDateKey(from) : null,
    to: to ? getIstDateKey(to) : null,
  });
}

function renderTooltipRow(
  label: string,
  value: number,
  accentClass = "text-white",
) {
  return (
    <div className="flex items-center justify-between gap-6 text-sm">
      <span className="text-white/68">{label}</span>
      <span className={`font-semibold tabular-nums ${accentClass}`}>
        {formatCompactNumber(value)}
      </span>
    </div>
  );
}

function TimelineTooltip({
  active,
  payload,
  activeBrand,
}: {
  active?: boolean;
  activeBrand: Brand;
  payload?: Array<{ payload: TimelineDatum }>;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  const tooltipBg = activeBrand === "bigwing" ? "bg-[#1a1a1a]/95" : "bg-[#1e3f62]/95";

  return (
    <div
      className={`min-w-[200px] rounded-[22px] border border-white/24 ${tooltipBg} px-5 py-4 text-white shadow-[0_8px_32px_rgba(255,255,255,0.08),0_20px_60px_rgba(0,0,0,0.35)] ring-0 backdrop-blur-2xl`}
    >
      <div className="pb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/52">
        {point.tooltipHeading}
      </div>
      <div className="text-base font-bold text-white">{point.tooltipLabel}</div>
      <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
        {activeBrand === "all" ? (
          <>
            {renderTooltipRow("Bigwing", point.bigwingLeads)}
            {renderTooltipRow("Redwing", point.redwingLeads)}
            {renderTooltipRow("Total", point.leads)}
          </>
        ) : (
          renderTooltipRow("Leads", point.leads)
        )}
      </div>
    </div>
  );
}

function PlatformTooltip({
  active,
  payload,
  activeBrand,
  isIndividualTab,
}: {
  active?: boolean;
  activeBrand: Brand;
  isIndividualTab?: boolean;
  payload?: Array<{ payload: PlatformDatum }>;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  const tooltipBg = activeBrand === "bigwing" ? "bg-[#1a1a1a]/95" : "bg-[#1e3f62]/95";

  return (
    <div
      className={`min-w-[200px] rounded-[22px] border border-white/24 ${tooltipBg} px-5 py-4 text-white shadow-[0_8px_32px_rgba(255,255,255,0.08),0_20px_60px_rgba(0,0,0,0.35)] ring-0 backdrop-blur-2xl`}
    >
      <div className="pb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/52">
        Platform / Source
      </div>
      <div className="text-base font-bold text-white">{point.name}</div>
      <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
        {isIndividualTab ? (
          <>
            {renderTooltipRow("IG", point.igValue ?? 0)}
            {renderTooltipRow("FB", point.fbValue ?? 0)}
            {renderTooltipRow("Total", (point.igValue ?? 0) + (point.fbValue ?? 0))}
          </>
        ) : (
          <>
            {activeBrand !== "redwing"
              ? renderTooltipRow("Bigwing", point.bigwingValue)
              : null}
            {activeBrand !== "bigwing"
              ? renderTooltipRow("Redwing", point.redwingValue)
              : null}
            {renderTooltipRow("Total", point.value)}
          </>
        )}
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
  activeBrand?: Brand;
  label?: string | number;
  labelHeading: string;
  payload?: Array<{ value?: number; name?: string }>;
}) {
  if (!active || !payload?.length) return null;

  const item = payload[0];
  const value = typeof item?.value === "number" ? item.value : Number(item?.value ?? 0);
  const valueLabel = item?.name ?? "Value";
  const tooltipBg = activeBrand === "bigwing" ? "bg-[#1a1a1a]/95" : "bg-[#1e3f62]/95";

  return (
    <div
      className={`min-w-[200px] rounded-[22px] border border-white/24 ${tooltipBg} px-5 py-4 text-white shadow-[0_8px_32px_rgba(255,255,255,0.08),0_20px_60px_rgba(0,0,0,0.35)] ring-0 backdrop-blur-2xl`}
    >
      <div className="pb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/52">
        {labelHeading}
      </div>
      <div className="text-base font-bold text-white">{label}</div>
      <div className="mt-3 border-t border-white/10 pt-3">
        {renderTooltipRow(valueLabel, value)}
      </div>
    </div>
  );
}

function parseDate(date: string | null) {
  return date ? new Date(`${date}T00:00:00`) : null;
}

function buildDateKeysInRange(from: Date, to: Date) {
  const keys: string[] = [];
  let cursor = startOfDay(from);
  const end = startOfDay(to);

  while (!isAfter(cursor, end)) {
    keys.push(getIstDateKey(cursor));
    cursor = addDays(cursor, 1);
  }

  return keys;
}

function getIstDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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

function parseHourValue(value: string) {
  const match = value.trim().match(/^(\d{1,2})/);
  if (!match) return null;

  const hour = Number(match[1]);
  return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

function formatChartLocationLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Unknown";

  return trimmed
    .replace(/[_-]+/g, " ")
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

function aggregateMetricByTab(
  summaries: DashboardDailySummary[],
  selector: (summary: DashboardDailySummary) => Record<string, number>,
) {
  const totals: Record<string, number> = {};

  for (const summary of summaries) {
    for (const [tab, value] of Object.entries(selector(summary))) {
      totals[tab] = (totals[tab] ?? 0) + value;
    }
  }

  return totals;
}

function aggregatePlatformMetricByTab(summaries: DashboardDailySummary[]) {
  const totals: Record<string, DashboardPlatformCounts> = {};

  for (const summary of summaries) {
    for (const [tab, value] of Object.entries(summary.platformCountsByTab)) {
      const existing = totals[tab] ?? { fb: 0, ig: 0 };
      totals[tab] = {
        fb: existing.fb + (value.fb ?? 0),
        ig: existing.ig + (value.ig ?? 0),
      };
    }
  }

  return totals;
}

function aggregateResponseMetricByTab(summaries: DashboardDailySummary[]) {
  const totals: Record<string, { no: number; yes: number }> = {};

  for (const summary of summaries) {
    for (const [tab, value] of Object.entries(summary.bigwingResponseCountsByTab)) {
      const existing = totals[tab] ?? { no: 0, yes: 0 };
      totals[tab] = {
        no: existing.no + (value.no ?? 0),
        yes: existing.yes + (value.yes ?? 0),
      };
    }
  }

  return totals;
}

function aggregateLocationMetricByTab(summaries: DashboardDailySummary[]) {
  const totals: Record<string, number[]> = {};

  for (const summary of summaries) {
    for (const [tab, values] of Object.entries(summary.redwingLocationCountsByTab)) {
      const nextValues = [...(totals[tab] ?? [])];
      values.forEach((count, index) => {
        nextValues[index] = (nextValues[index] ?? 0) + count;
      });
      totals[tab] = nextValues;
    }
  }

  return totals;
}

function sumTabs(metricByTab: Record<string, number>, tabs: string[]) {
  return tabs.reduce((total, tab) => total + (metricByTab[tab] ?? 0), 0);
}

function sumPlatformMetricTabs(
  platformCountsByTab: Record<string, DashboardPlatformCounts>,
  tabs: string[],
  platform: "fb" | "ig",
) {
  return tabs.reduce(
    (total, tab) => total + (platformCountsByTab[tab]?.[platform] ?? 0),
    0,
  );
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

export function DashboardClient({
  initialBrand,
  initialWorkbook = null,
}: DashboardClientProps) {
  const [isPending, startTransition] = useTransition();
  const [isBrandPending, startBrandTransition] = useTransition();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const [isMounted, setIsMounted] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(false);
  const [brand, setBrand] = React.useState<Brand>(initialBrand);
  const [campaignFilter, setCampaignFilter] = React.useState("all");
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(() => ({
    from: DASHBOARD_RANGE_START,
    to: new Date(),
  }));
  const [isDigitalModalOpen, setIsDigitalModalOpen] = React.useState(false);
  const [digitalPin, setDigitalPin] = React.useState("");
  const [isDigitalPinVerified, setIsDigitalPinVerified] = React.useState(false);
  const [isDigitalLoading, setIsDigitalLoading] = React.useState(false);
  const [digitalMeta, setDigitalMeta] =
    React.useState<DigitalLeadImportMeta | null>(null);
  const [digitalResponseText, setDigitalResponseText] = React.useState("");
  const [digitalError, setDigitalError] = React.useState<string | null>(null);
  const [digitalSuccessMessage, setDigitalSuccessMessage] = React.useState("");
  const [metaSpend, setMetaSpend] = React.useState<MetaSpendSummary | null>(null);
  const [metaSpendError, setMetaSpendError] = React.useState<string | null>(null);
  const [isMetaSpendLoading, setIsMetaSpendLoading] = React.useState(false);
  const [isWorkbookLoading, setIsWorkbookLoading] = React.useState(
    initialWorkbook === null,
  );
  const [cachedDashboardCards, setCachedDashboardCards] = React.useState<
    CachedDashboardCard[] | null
  >(null);
  const [workbook, setWorkbook] = React.useState<DashboardData>(
    initialWorkbook ?? EMPTY_DASHBOARD_DATA,
  );
  const metaSpendCacheRef = React.useRef(
    new Map<
      string,
      { data: MetaSpendSummary | null; error: string | null; fetchedAt: number }
    >(),
  );
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    setIsMounted(true);
    window.dispatchEvent(new Event("resize"));
  }, []);

  React.useEffect(() => {
    if (initialWorkbook) {
      setWorkbook(initialWorkbook);
      setIsWorkbookLoading(false);
    }
  }, [initialWorkbook]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const updateIsDesktop = () => setIsDesktop(mediaQuery.matches);

    updateIsDesktop();
    mediaQuery.addEventListener("change", updateIsDesktop);
    return () => mediaQuery.removeEventListener("change", updateIsDesktop);
  }, []);

  const updateMetadata = React.useEffectEvent((nextBrand: Brand) => {
    syncBrandMetadata(nextBrand);
  });

  React.useEffect(() => {
    updateMetadata(brand);
  }, [brand]);

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

  React.useEffect(() => {
    const interval = setInterval(() => {
      void loadWorkbookData({ silent: true });
    }, 1800000);

    return () => clearInterval(interval);
  }, []);

  const loadWorkbookData = React.useEffectEvent(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setIsWorkbookLoading(true);
      }

      try {
        const response = await fetch("/api/dashboard", {
          cache: "no-store",
          method: "GET",
        });
        const data = (await response.json().catch(() => null)) as DashboardData | null;

        if (!response.ok || !data) {
          throw new Error("Unable to load dashboard data right now.");
        }

        setWorkbook(data);
      } catch (error) {
        setWorkbook((current) => ({
          ...current,
          error:
            error instanceof Error
              ? error.message
              : "Unable to load dashboard data right now.",
        }));
      } finally {
        setIsWorkbookLoading(false);
      }
    },
  );

  React.useEffect(() => {
    if (initialWorkbook) {
      return;
    }

    void loadWorkbookData();
  }, [initialWorkbook]);

  const hasSummaryData = workbook.dailySummaries.length > 0;
  const hasWorkbookPayload =
    workbook.dailySummaries.length > 0 ||
    workbook.tabs.length > 0 ||
    workbook.digitalLeads.length > 0 ||
    Boolean(workbook.error);
  const showInitialWorkbookLoading = isWorkbookLoading && !hasWorkbookPayload;
  const dashboardStatCacheKey = React.useMemo(
    () =>
      buildDashboardStatCacheKey({
        brand,
        campaignFilter,
        from: dateRange?.from,
        to: dateRange?.to,
      }),
    [brand, campaignFilter, dateRange?.from, dateRange?.to],
  );
  const tabBrandLookup = workbook.tabBrandLookup;

  React.useLayoutEffect(() => {
    setCachedDashboardCards(
      readDashboardStatCacheStore()[brand]?.[dashboardStatCacheKey]?.cards ?? null,
    );
  }, [brand, dashboardStatCacheKey]);

  const filteredDashboardSummaries = React.useMemo(() => {
    const fromDate = dateRange?.from;
    const toDate = dateRange?.to;
    const from = fromDate ? startOfDay(fromDate) : null;
    const to = toDate ? endOfDay(toDate) : null;

    return workbook.dailySummaries.filter((entry) => {
      const date = parseDate(entry.date);
      if (!date) return false;
      return (!from || !isBefore(date, from)) && (!to || !isAfter(date, to));
    });
  }, [dateRange, workbook.dailySummaries]);

  const brandTabs = React.useMemo(() => {
    if (brand === "all") {
      return workbook.tabs;
    }

    return workbook.tabs.filter((tab) => tabBrandLookup[tab] === brand);
  }, [brand, tabBrandLookup, workbook.tabs]);

  const aggregatedLeadCountsByTab = React.useMemo(
    () =>
      aggregateMetricByTab(
        filteredDashboardSummaries,
        (summary) => summary.leadCountsByTab,
      ),
    [filteredDashboardSummaries],
  );

  const aggregatedTopCampaignCountsByTab = React.useMemo(
    () =>
      aggregateMetricByTab(
        filteredDashboardSummaries,
        (summary) => summary.topCampaignCountsByTab,
      ),
    [filteredDashboardSummaries],
  );

  const aggregatedPlatformCountsByTab = React.useMemo(
    () => aggregatePlatformMetricByTab(filteredDashboardSummaries),
    [filteredDashboardSummaries],
  );

  const aggregatedBigwingResponsesByTab = React.useMemo(
    () => aggregateResponseMetricByTab(filteredDashboardSummaries),
    [filteredDashboardSummaries],
  );

  const aggregatedRedwingLocationsByTab = React.useMemo(
    () => aggregateLocationMetricByTab(filteredDashboardSummaries),
    [filteredDashboardSummaries],
  );

  const campaignOptions = React.useMemo(() => brandTabs, [brandTabs]);

  React.useEffect(() => {
    if (campaignFilter === "all") {
      return;
    }

    if (!brandTabs.includes(campaignFilter)) {
      setCampaignFilter("all");
    }
  }, [brandTabs, campaignFilter]);

  const selectedTabs = React.useMemo(() => {
    if (campaignFilter === "all") {
      return brandTabs;
    }

    return brandTabs.includes(campaignFilter) ? [campaignFilter] : [];
  }, [brandTabs, campaignFilter]);

  const selectedBigwingTabs = React.useMemo(
    () => selectedTabs.filter((tab) => tabBrandLookup[tab] === "bigwing"),
    [selectedTabs, tabBrandLookup],
  );

  const selectedRedwingTabs = React.useMemo(
    () => selectedTabs.filter((tab) => tabBrandLookup[tab] === "redwing"),
    [selectedTabs, tabBrandLookup],
  );

  const totalLeads = React.useMemo(
    () =>
      filteredDashboardSummaries.reduce((total, summary) => {
        if (campaignFilter !== "all") {
          return total + sumTabs(summary.leadCountsByTab, selectedTabs);
        }

        if (brand === "bigwing") {
          return total + summary.bigwingLeads;
        }

        if (brand === "redwing") {
          return total + summary.redwingLeads;
        }

        return total + summary.totalLeads;
      }, 0),
    [brand, campaignFilter, filteredDashboardSummaries, selectedTabs],
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

  const selectedCampaignRequests = React.useMemo(
    () =>
      selectedTabs.map((tab) => ({
        aliases: workbook.campaignAliasesByTab[tab] ?? [tab],
        label: tab,
      })),
    [selectedTabs, workbook.campaignAliasesByTab],
  );

  const metaSpendRequestKey = React.useMemo(() => {
    if (!metaSpendDateRange) {
      return "";
    }

    return JSON.stringify({
      campaigns: selectedCampaignRequests.map((campaign) => ({
        aliases: campaign.aliases,
        label: campaign.label,
      })),
      from: metaSpendDateRange.from,
      to: metaSpendDateRange.to,
    });
  }, [metaSpendDateRange, selectedCampaignRequests]);

  React.useEffect(() => {
    if (showInitialWorkbookLoading) {
      setIsMetaSpendLoading(false);
      return;
    }

    if (!metaSpendDateRange) {
      setMetaSpend(null);
      setMetaSpendError(null);
      setIsMetaSpendLoading(false);
      return;
    }

    const activeDateRange = metaSpendDateRange;
    const activeCampaignRequests = selectedCampaignRequests;
    const activeRequestKey = metaSpendRequestKey;
    const controller = new AbortController();
    let isDisposed = false;

    async function loadMetaSpend({ force = false }: { force?: boolean } = {}) {
      const cachedEntry = metaSpendCacheRef.current.get(activeRequestKey);
      const isCacheFresh =
        !force &&
        cachedEntry &&
        Date.now() - cachedEntry.fetchedAt < META_SPEND_REFRESH_INTERVAL_MS;

      if (isCacheFresh) {
        setMetaSpend(cachedEntry.data);
        setMetaSpendError(cachedEntry.error);
        setIsMetaSpendLoading(false);
        return;
      }

      try {
        setMetaSpendError(null);
        setIsMetaSpendLoading(true);

        const response = await fetch("/api/meta/spend", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            campaigns: activeCampaignRequests,
            from: activeDateRange.from,
            to: activeDateRange.to,
          }),
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as
          | ({ ok?: boolean; error?: string } & Partial<MetaSpendSummary>)
          | null;

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || "Unable to fetch Meta spend right now.");
        }

        const nextMetaSpend: MetaSpendSummary = {
          campaigns: Array.isArray(data.campaigns)
            ? data.campaigns.map((campaign) => ({
                cpc: Number(campaign?.cpc ?? 0),
                currency:
                  typeof campaign?.currency === "string" && campaign.currency
                    ? campaign.currency
                    : "INR",
                name:
                  typeof campaign?.name === "string" ? campaign.name : "Unknown",
                spend: Number(campaign?.spend ?? 0),
              }))
            : [],
          configured: Boolean(data.configured),
          currency:
            typeof data.currency === "string" && data.currency
              ? data.currency
              : "INR",
          matchedCampaigns: Number(data.matchedCampaigns ?? 0),
          requestedCampaigns: Number(data.requestedCampaigns ?? 0),
          totalSpend: Number(data.totalSpend ?? 0),
        };

        metaSpendCacheRef.current.set(activeRequestKey, {
          data: nextMetaSpend,
          error: null,
          fetchedAt: Date.now(),
        });

        if (isDisposed) {
          return;
        }

        setMetaSpend(nextMetaSpend);
        setMetaSpendError(null);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        const nextError =
          error instanceof Error
            ? error.message
            : "Unable to fetch Meta spend right now.";

        metaSpendCacheRef.current.set(activeRequestKey, {
          data: null,
          error: nextError,
          fetchedAt: Date.now(),
        });

        if (isDisposed) {
          return;
        }

        setMetaSpendError(nextError);
      } finally {
        if (!controller.signal.aborted && !isDisposed) {
          setIsMetaSpendLoading(false);
        }
      }
    }

    void loadMetaSpend();

    const refreshInterval = setInterval(() => {
      void loadMetaSpend({ force: true });
    }, META_SPEND_REFRESH_INTERVAL_MS);

    return () => {
      isDisposed = true;
      controller.abort();
      clearInterval(refreshInterval);
    };
  }, [
    metaSpendDateRange,
    metaSpendRequestKey,
    selectedCampaignRequests,
    showInitialWorkbookLoading,
  ]);

  const matchedCampaigns = metaSpend?.campaigns ?? [];
  const metaCpcTotal = matchedCampaigns.reduce(
    (total, campaign) => total + campaign.cpc,
    0,
  );

  const metaCostValue = React.useMemo(() => {
    if (isMetaSpendLoading && !metaSpend) return "...";
    if (!metaSpend?.configured) return "--";

    return formatCurrencyAmount(metaSpend.totalSpend, metaSpend.currency);
  }, [isMetaSpendLoading, metaSpend]);

  const metaCpcAverage = matchedCampaigns.length > 0 ? metaCpcTotal / matchedCampaigns.length : 0;
  const metaCpcValue = React.useMemo(() => {
    if (isMetaSpendLoading && !metaSpend) return "...";
    if (!metaSpend?.configured || matchedCampaigns.length === 0) return "--";

    return formatCurrencyAmount(metaCpcAverage, metaSpend.currency);
  }, [isMetaSpendLoading, matchedCampaigns.length, metaCpcAverage, metaSpend]);

  const metaCostHint = React.useMemo(() => {
    if (isMetaSpendLoading && !metaSpend) {
      return "Fetching live Meta cost.";
    }

    if (metaSpendError) {
      return metaSpendError;
    }

    if (!metaSpend?.configured) {
      return "Add API";
    }

    const matchedCampaignSet = new Set((metaSpend.campaigns ?? []).map((c) => c.name));
    const unmatched = selectedTabs.filter((tab) => !matchedCampaignSet.has(tab));

    let hint = `${metaSpend.matchedCampaigns} matched campaign${
      metaSpend.matchedCampaigns === 1 ? "" : "s"
    } from Meta`;

    if (unmatched.length > 0 && unmatched.length < selectedTabs.length) {
      const unmatchedLabels = unmatched.map(tab => workbook.tabLabels?.[tab] || tab);
      hint += ` (Missing: ${unmatchedLabels.join(", ")})`;
    }

    return hint;
  }, [isMetaSpendLoading, metaSpend, metaSpendError, selectedTabs, workbook.tabLabels]);

  const metaCpcHint = React.useMemo(() => {
    if (isMetaSpendLoading && !metaSpend) {
      return "Fetching live Meta CPC.";
    }

    if (metaSpendError) {
      return metaSpendError;
    }

    if (!metaSpend?.configured) {
      return "Meta configuration is required.";
    }

    if (matchedCampaigns.length === 0) {
      return "No matched campaign has CPC data in this range.";
    }

    return campaignFilter === "all"
      ? `Average of ${matchedCampaigns.length} campaign CPC.`
      : "Live CPC from Meta for the selected campaign.";
  }, [campaignFilter, isMetaSpendLoading, matchedCampaigns.length, metaSpend, metaSpendError]);

  const dashboardCards = React.useMemo<DashboardCard[]>(() => {
    const totalLeadHint =
      campaignFilter === "all"
        ? brand === "all"
        ? `Total leads among ${selectedTabs.length} campaigns`
          : `${BRAND_CONFIG[brand].label} total leads`
        : "Total leads for the selected campaign";

    const cards: DashboardCard[] = [
      {
        hint: totalLeadHint,
        icon: Users,
        label: "Total Leads",
        format: "compact",
        numericValue: totalLeads,
        value: formatCompactNumber(totalLeads),
      },
      {
        hint:
          campaignFilter === "all"
            ? `${selectedTabs.length} campaign${
                selectedTabs.length === 1 ? "" : "s"
              } selected`
            : "1 selected campaign",
        icon: Target,
        label: "Campaign Count",
        format: "compact",
        numericValue: selectedTabs.length,
        value: formatCompactNumber(selectedTabs.length),
      },
      {
        currency: metaSpend?.currency,
        format: metaSpend?.configured ? "currency" : undefined,
        hint: metaCostHint,
        icon: IndianRupee,
        isRefreshing: isMetaSpendLoading,
        label: "Cost Spent",
        numericValue: metaSpend?.configured ? metaSpend.totalSpend : undefined,
        value: metaCostValue,
      },
      {
        currency: metaSpend?.currency,
        format:
          metaSpend?.configured && matchedCampaigns.length > 0 ? "currency" : undefined,
        hint: metaCpcHint,
        icon: Sparkles,
        isRefreshing: isMetaSpendLoading,
        label: "Meta CPC",
        numericValue:
          metaSpend?.configured && matchedCampaigns.length > 0
            ? metaCpcAverage
            : undefined,
        value: metaCpcValue,
      },
    ];

    return cards;
  }, [
    brand,
    campaignFilter,
    metaCostHint,
    metaCostValue,
    metaCpcHint,
    metaCpcValue,
    isMetaSpendLoading,
    selectedTabs.length,
    totalLeads,
    metaSpend,
    metaCpcAverage,
    matchedCampaigns.length,
  ]);

  React.useEffect(() => {
    if (!hasWorkbookPayload || showInitialWorkbookLoading) {
      return;
    }

    const persistCards = () => {
      const existingStore = readDashboardStatCacheStore();
      const brandCacheBucket = existingStore[brand] ?? {};
      const previousCards = brandCacheBucket[dashboardStatCacheKey]?.cards ?? [];
      const previousByLabel = new Map(
        previousCards.map((card) => [card.label, card]),
      );

      const nextCards = dashboardCards.map<CachedDashboardCard>((card) => {
        const isStableValue =
          typeof card.numericValue === "number" &&
          Number.isFinite(card.numericValue);

        if (isStableValue) {
          return {
            currency: card.currency,
            format: card.format,
            label: card.label,
            numericValue: card.numericValue,
            value: card.value,
          };
        }

        return (
          previousByLabel.get(card.label) ?? {
            currency: card.currency,
            format: card.format,
            label: card.label,
            numericValue: card.numericValue,
            value: card.value,
          }
        );
      });

      const nextStore: DashboardStatCacheStore = {
        ...existingStore,
        [brand]: {
          ...brandCacheBucket,
          [dashboardStatCacheKey]: {
            cards: nextCards,
            updatedAt: Date.now(),
          },
        },
      };

      writeDashboardStatCacheStore(nextStore);
      setCachedDashboardCards(nextCards);
    };

    persistCards();
    const interval = window.setInterval(
      persistCards,
      DASHBOARD_STAT_CACHE_WRITE_INTERVAL_MS,
    );

    return () => window.clearInterval(interval);
  }, [
    brand,
    dashboardCards,
    dashboardStatCacheKey,
    hasWorkbookPayload,
    showInitialWorkbookLoading,
  ]);

  const displayDashboardCards = React.useMemo(() => {
    if (!cachedDashboardCards?.length) {
      return dashboardCards;
    }

    const cachedCardsByLabel = new Map(
      cachedDashboardCards.map((card) => [card.label, card]),
    );

    return dashboardCards.map((card) => {
      const cachedCard = cachedCardsByLabel.get(card.label);
      if (!cachedCard) {
        return card;
      }

      if (showInitialWorkbookLoading) {
        return {
          ...card,
          animate: false,
          currency: cachedCard.currency ?? card.currency,
          format: cachedCard.format ?? card.format,
          isRefreshing: false,
          numericValue: cachedCard.numericValue,
          value: cachedCard.value,
        };
      }

      if (typeof card.numericValue === "number") {
        const cachedNumericValue =
          typeof cachedCard.numericValue === "number" &&
          Number.isFinite(cachedCard.numericValue)
            ? cachedCard.numericValue
            : null;
        const shouldAnimateFromCache =
          cachedNumericValue !== null &&
          Math.abs(card.numericValue - cachedNumericValue) >= 0.01;

        return {
          ...card,
          animate: shouldAnimateFromCache,
          startingValue: shouldAnimateFromCache ? cachedNumericValue : undefined,
        };
      }

      if (
        card.isRefreshing &&
        typeof cachedCard.numericValue === "number" &&
        cachedCard.format
      ) {
        return {
          ...card,
          animate: false,
          currency: cachedCard.currency ?? card.currency,
          format: cachedCard.format ?? card.format,
          numericValue: cachedCard.numericValue,
          value: cachedCard.value,
        };
      }

      return card;
    });
  }, [cachedDashboardCards, dashboardCards, showInitialWorkbookLoading]);

  const filteredDigitalLeads = React.useMemo(() => {
    const fromDate = dateRange?.from;
    const toDate = dateRange?.to;
    const from = fromDate ? startOfDay(fromDate) : null;
    const to = toDate ? endOfDay(toDate) : null;

    return workbook.digitalLeads.filter((entry) => {
      const date = parseDate(entry.date);
      if (!date) return false;
      return (!from || !isBefore(date, from)) && (!to || !isAfter(date, to));
    });
  }, [dateRange, workbook.digitalLeads]);

  const currentRangeFrom = dateRange?.from;
  const currentRangeTo = dateRange?.to;
  const isSingleDayRange = Boolean(
    currentRangeFrom &&
      currentRangeTo &&
      getIstDateKey(currentRangeFrom) === getIstDateKey(currentRangeTo),
  );
  const selectedIstDateKey =
    isSingleDayRange && currentRangeFrom ? getIstDateKey(currentRangeFrom) : null;
  const todayIstKey = getIstDateKey(new Date());
  const isTodaySingleDayRange = selectedIstDateKey === todayIstKey;

  const timelineData = React.useMemo<TimelineDatum[]>(() => {
    if (isSingleDayRange && selectedIstDateKey) {
      const selectedSummary = filteredDashboardSummaries.find(
        (summary) => summary.date === selectedIstDateKey,
      );
      const hourLimit = isTodaySingleDayRange ? new Date().getHours() : 23;
      const timelineMap = new Map<number, TimelineDatum>();

      for (let hour = 0; hour <= hourLimit; hour += 1) {
        timelineMap.set(hour, {
          bigwingLeads: 0,
          date: `${selectedIstDateKey} ${String(hour).padStart(2, "0")}`,
          fbLeads: 0,
          igLeads: 0,
          label: formatHourLabel(hour),
          leads: 0,
          redwingLeads: 0,
          tooltipHeading: "Time",
          tooltipLabel: formatHourTooltipLabel(hour),
        });
      }

      if (selectedSummary) {
        for (const tab of selectedTabs) {
          for (const value of selectedSummary.hourlyBreakdownByTab[tab] ?? []) {
            const hour = parseHourValue(value);
            if (hour == null || hour > hourLimit) continue;

            const bucket = timelineMap.get(hour);
            if (!bucket) continue;

            bucket.leads += 1;
            if (tabBrandLookup[tab] === "bigwing") bucket.bigwingLeads += 1;
            if (tabBrandLookup[tab] === "redwing") bucket.redwingLeads += 1;
          }
        }
      }

      return Array.from(timelineMap.values()).sort((left, right) =>
        left.date.localeCompare(right.date),
      );
    }

    const rangeFrom = currentRangeFrom ?? currentRangeTo;
    const rangeTo = currentRangeTo ?? currentRangeFrom;
    const summariesByDate = new Map(
      filteredDashboardSummaries.map((summary) => [summary.date, summary] as const),
    );
    const dateKeys =
      rangeFrom && rangeTo
        ? buildDateKeysInRange(rangeFrom, rangeTo)
        : filteredDashboardSummaries.map((summary) => summary.date);

    return dateKeys.map((dateKey) => {
      const summary = summariesByDate.get(dateKey);
      const igLeads = summary ? sumPlatformMetricTabs(summary.platformCountsByTab, selectedTabs, "ig") : 0;
      const fbLeads = summary ? sumPlatformMetricTabs(summary.platformCountsByTab, selectedTabs, "fb") : 0;

      return {
        bigwingLeads: summary ? sumTabs(summary.leadCountsByTab, selectedBigwingTabs) : 0,
        date: dateKey,
        fbLeads,
        igLeads,
        label: dateKey.slice(8, 10),
        leads: summary ? sumTabs(summary.leadCountsByTab, selectedTabs) : 0,
        redwingLeads: summary ? sumTabs(summary.leadCountsByTab, selectedRedwingTabs) : 0,
        tooltipHeading: "Date",
        tooltipLabel: dateKey,
      };
    });
  }, [
    currentRangeFrom,
    currentRangeTo,
    filteredDashboardSummaries,
    isSingleDayRange,
    isTodaySingleDayRange,
    selectedBigwingTabs,
    selectedIstDateKey,
    selectedRedwingTabs,
    selectedTabs,
    tabBrandLookup,
  ]);

  const timelineTickInterval = Math.max(0, Math.ceil(timelineData.length / 6) - 1);

  const platformData = React.useMemo<PlatformDatum[]>(() => {
    let bigwingIg = 0;
    let bigwingFb = 0;
    let redwingIg = 0;
    let redwingFb = 0;

    for (const tab of selectedTabs) {
      const counts = aggregatedPlatformCountsByTab[tab] ?? { fb: 0, ig: 0 };
      if (tabBrandLookup[tab] === "bigwing") {
        bigwingIg += counts.ig;
        bigwingFb += counts.fb;
      } else if (tabBrandLookup[tab] === "redwing") {
        redwingIg += counts.ig;
        redwingFb += counts.fb;
      }
    }

    const igTotal = bigwingIg + redwingIg;
    const fbTotal = bigwingFb + redwingFb;

    return [
      {
        bigwingValue: bigwingIg,
        fbValue: fbTotal,
        igValue: igTotal,
        name: "IG",
        redwingValue: redwingIg,
        value: igTotal,
      },
      {
        bigwingValue: bigwingFb,
        fbValue: fbTotal,
        igValue: igTotal,
        name: "FB",
        redwingValue: redwingFb,
        value: fbTotal,
      },
    ].filter((item) => item.value > 0);
  }, [aggregatedPlatformCountsByTab, selectedTabs, tabBrandLookup]);

  const campaignData = React.useMemo(
    () =>
      selectedTabs
        .map((tab) => ({
          campaign: tab,
          fb: aggregatedPlatformCountsByTab[tab]?.fb ?? 0,
          ig: aggregatedPlatformCountsByTab[tab]?.ig ?? 0,
          leads:
            aggregatedTopCampaignCountsByTab[tab] ??
            aggregatedLeadCountsByTab[tab] ??
            0,
        }))
        .filter((item) => item.leads > 0)
        .sort((left, right) => right.leads - left.leads)
        .slice(0, 8),
    [aggregatedLeadCountsByTab, aggregatedPlatformCountsByTab, aggregatedTopCampaignCountsByTab, selectedTabs],
  );

  const todayCampaignData = React.useMemo(() => {
    const todaySummary = workbook.dailySummaries.find((entry) => entry.date === todayIstKey);
    if (!todaySummary || brand !== "all") {
      return [];
    }

    return workbook.tabs
      .map((tab) => ({
        campaign: tab,
        leads: todaySummary.topCampaignCountsByTab[tab] ?? todaySummary.leadCountsByTab[tab] ?? 0,
      }))
      .filter((item) => item.leads > 0)
      .sort((left, right) => right.leads - left.leads)
      .slice(0, 2);
  }, [brand, todayIstKey, workbook.dailySummaries, workbook.tabs]);

  const bigwingResponseData = React.useMemo(() => {
    const totals = { no: 0, yes: 0 };

    for (const tab of selectedBigwingTabs) {
      const response = aggregatedBigwingResponsesByTab[tab];
      if (!response) continue;
      totals.yes += response.yes;
      totals.no += response.no;
    }

    return [
      { leads: totals.yes, response: "Yes" },
      { leads: totals.no, response: "No" },
    ].filter((item) => item.leads > 0);
  }, [aggregatedBigwingResponsesByTab, selectedBigwingTabs]);

  const redwingLocationData = React.useMemo(() => {
    const countsByLabel = new Map<string, number>();

    for (const tab of selectedRedwingTabs) {
      const counts = aggregatedRedwingLocationsByTab[tab] ?? [];
      counts.forEach((count, index) => {
        const label = workbook.redwingLocationLabels[index] ?? `Location ${index + 1}`;
        countsByLabel.set(label, (countsByLabel.get(label) ?? 0) + count);
      });
    }

    return Array.from(countsByLabel.entries())
      .map(([location, leads]) => ({
        leads,
        location: formatChartLocationLabel(location),
      }))
      .sort((left, right) => right.leads - left.leads);
  }, [aggregatedRedwingLocationsByTab, selectedRedwingTabs, workbook.redwingLocationLabels]);

  const activeBrandAssets = getBrandAssets(brand);
  const leadsPageHref = `/leads?brand=${brand === "all" ? "bigwing" : brand}`;
  const dashboardBackground =
    brand === "bigwing" ? "#000000" : "#0D4D8B";
  const chartPrimary = "#ffffff";
  const chartAccent = "#8de0ff";
  const chartHoverCursor = "rgba(216, 216, 216, 0.1)";
  const pieColors = ["#ffffff", "#8de0ff", "#eefbff", "#d8f3ff", "#b9eaff"];
  const redwingLocationAxisWidth = isDesktop ? 118 : 80;
  const redwingLocationAxisFontSize = isDesktop ? 14 : 10;
  const redwingLocationChartMargin = isDesktop
    ? { left: 0, right: 0 }
    : { left: -12, right: 0 };
  const redwingLocationChartHeight = Math.max(
    brand === "redwing" ? 180 : 220,
    redwingLocationData.length * (brand === "redwing" ? 32 : 42),
  );

  async function handleLogout() {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setIsLoggingOut(false);
    }
  }

  function handleBrandChange(nextBrand: Brand) {
    if (nextBrand === brand) return;

    startBrandTransition(() => {
      setBrand(nextBrand);
      setCampaignFilter("all");
      const params = new URLSearchParams(searchParams.toString());
      if (nextBrand === "all") {
        params.delete("brand");
      } else {
        params.set("brand", nextBrand);
      }

      const nextUrl = params.toString() ? `${pathname}?${params}` : pathname;
      router.replace(nextUrl, { scroll: false });
    });
  }

  function handleOpenLeadsTable() {
    startTransition(() => {
      router.push(leadsPageHref);
    });
  }

  function openDigitalModal() {
    setIsDigitalModalOpen(true);
    setDigitalError(null);
    setDigitalSuccessMessage("");
  }

  function closeDigitalModal() {
    setIsDigitalModalOpen(false);
    setDigitalError(null);
    setDigitalSuccessMessage("");
  }

  async function handleDigitalPinSubmit() {
    setDigitalError(null);
    setDigitalSuccessMessage("");
    setIsDigitalLoading(true);

    try {
      const response = await fetch("/api/digital/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pin: digitalPin }),
      });
      const data = (await response.json().catch(() => null)) as
        | ({ ok?: boolean; error?: string } & Partial<DigitalLeadImportMeta>)
        | null;

      if (!response.ok || !data?.ok) {
        setIsDigitalPinVerified(false);
        setDigitalMeta(null);
        setDigitalError(data?.error ?? "Wrong digital PIN.");
        return;
      }

      setIsDigitalPinVerified(true);
      setDigitalMeta({
        lastImportedDate:
          typeof data.lastImportedDate === "string" ? data.lastImportedDate : null,
        prompt: typeof data.prompt === "string" ? data.prompt : "",
      });
      setDigitalError(null);
    } catch (error) {
      setDigitalError(
        error instanceof Error
          ? error.message
          : "Unable to verify the digital PIN.",
      );
    } finally {
      setIsDigitalLoading(false);
    }
  }

  async function handleCopyDigitalPrompt() {
    if (!digitalMeta?.prompt) return;

    try {
      await navigator.clipboard.writeText(digitalMeta.prompt);
      setDigitalSuccessMessage("Prompt copied.");
    } catch {
      setDigitalError("Unable to copy the prompt right now.");
    }
  }

  async function handleDigitalImportSubmit() {
    setDigitalError(null);
    setDigitalSuccessMessage("");
    setIsDigitalLoading(true);

    try {
      const parsed = JSON.parse(digitalResponseText) as { entries?: unknown[] };
      const response = await fetch("/api/digital/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payload: parsed,
          pin: digitalPin,
          promptUsed: digitalMeta?.prompt ?? "",
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { count?: number; error?: string; ok?: boolean }
        | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error ?? "Unable to import the pasted JSON.");
      }

      setDigitalSuccessMessage(
        `${data.count} row${data.count === 1 ? "" : "s"} appended to DATA.`,
      );
      setDigitalResponseText("");

      const refreshedMeta = await fetch("/api/digital/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pin: digitalPin }),
      });
      const refreshedData = (await refreshedMeta.json().catch(() => null)) as
        | ({ ok?: boolean } & Partial<DigitalLeadImportMeta>)
        | null;

      if (refreshedMeta.ok && refreshedData?.ok) {
        setDigitalMeta({
          lastImportedDate:
            typeof refreshedData.lastImportedDate === "string"
              ? refreshedData.lastImportedDate
              : null,
          prompt: typeof refreshedData.prompt === "string" ? refreshedData.prompt : "",
        });
      }

      void loadWorkbookData();
    } catch (error) {
      setDigitalError(
        error instanceof Error
          ? error.message
          : "Paste valid JSON from ChatGPT before importing.",
      );
    } finally {
      setIsDigitalLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen text-white transition-[background-color] duration-500 ease-out"
      style={{ backgroundColor: dashboardBackground }}
    >
      <div className="min-h-screen">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 sm:gap-8 sm:px-6 sm:py-6 lg:px-8">
          <section className="relative crm-surface-radius border border-white/14 bg-white/10 p-4 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-white/65">
                  <Sparkles className="h-3.5 w-3.5" />
                  {brand === "all" ? "Combined Dashboard" : `${activeBrandAssets.label} Dashboard`}
                </div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {campaignFilter !== "all" ? (workbook.tabLabels?.[campaignFilter] || campaignFilter) : "Campaign analytics"}
                </h1>
                <p className="mt-1 max-w-3xl text-xs text-white/68 sm:mt-2 sm:text-sm">
                  Live analytics hub integrating Meta spend and Google Sheets lead
                  data, delivering real-time insights into campaign performance,
                  platform splits, and regional rankings for Redwing and Bigwing.
                </p>

                {workbook.error ? (
                  <p className="mt-3 rounded-2xl border border-[#ffb4b4]/20 bg-[#ffb4b4]/8 px-4 py-3 text-sm text-[#ffe2e2]">
                    {workbook.error}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 lg:min-h-[132px] lg:items-end lg:justify-between">
                <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-end">
                  {brandOptions.map((option) => {
                    const selected = option === brand;
                    const loading = isBrandPending && selected;
                    const label = option === "all" ? "All" : BRAND_CONFIG[option].label;

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
                        className="absolute top-4 right-16 rounded-full border border-white/12 bg-white/8 text-white/82 shadow-none backdrop-blur-xl hover:bg-white/8 hover:text-white sm:right-24 md:right-32 lg:static"
                        onClick={openDigitalModal}
                        aria-label="Open digital leads importer"
                      >
                        <FileUp className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-4 right-4 rounded-full border border-white/12 bg-white/8 text-white/82 shadow-none backdrop-blur-xl hover:bg-white/8 hover:text-white lg:static lg:h-auto lg:w-auto lg:gap-2 lg:px-5 lg:py-1"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      aria-busy={isLoggingOut}
                    >
                      {isLoggingOut ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <LogOut className="h-4 w-4" />
                      )}
                      <span className="hidden lg:inline">
                        {isLoggingOut ? "Logging out..." : "Logout"}
                      </span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-3 crm-surface-radius border border-white/14 bg-white/10 p-5 backdrop-blur-2xl lg:grid-cols-[1.2fr_0.9fr_1.8fr] sm:gap-4">
            <DateRangePicker date={dateRange} onSelect={setDateRange} brand={brand} />

            <FilterSelect
              id="campaign-filter"
              label="Campaign"
              value={campaignFilter}
              onChange={setCampaignFilter}
              disabled={showInitialWorkbookLoading || brand === "all" || brandTabs.length === 0}
              options={[
                { value: "all", label: "All campaigns" },
                ...campaignOptions.map((campaign) => ({
                  label: workbook.tabLabels?.[campaign] || campaign,
                  value: campaign,
                })),
              ]}
            />

            <DisabledAdNameSearchInput id="ad-search" />
          </section>

          {!showInitialWorkbookLoading && !hasSummaryData ? (
            <section className="crm-surface-radius border border-[#ffe7b0]/18 bg-[#ffe7b0]/8 p-5 text-[#ffe7b0] shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur-2xl">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <h2 className="text-base font-semibold text-[#fff6d9]">
                    DATA summary rows are missing
                  </h2>
                  <p className="mt-2 text-sm leading-6">
                    This dashboard reads the DATA-sheet summary rows. Once those
                    daily summary rows are present, the cards and charts below will
                    populate automatically.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {displayDashboardCards.map((card) => (
              <DashboardStatCard key={card.label} card={card} />
            ))}
          </section>

          <section className="grid gap-3 sm:gap-4 xl:grid-cols-[1.4fr_1fr]">
            <div className="crm-surface-radius border border-white/14 bg-white/10 p-4 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl sm:p-5">
              <div className="mb-3 flex items-start justify-between gap-4 sm:mb-6">
                <div>
                  <h2 className="text-xl font-semibold">Lead timeline</h2>
                  <p className="mt-1 text-sm text-white/58">
                    {isSingleDayRange
                      ? "Hourly lead volume from the DATA hourly breakdown."
                      : "Daily lead volume from DATA summary totals."}
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
                          <h3 className="text-sm font-semibold text-white">
                            How timeline counts work
                          </h3>
                          <p className="mt-1 text-xs leading-5 text-white/68">
                            Single-day selections use the DATA row&apos;s hourly
                            breakdown arrays. Multi-day ranges use the per-day DATA
                            summary totals.
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/52">
                            Scope
                          </p>
                          <p className="mt-1 text-xs leading-5 text-white/76">
                            The chart respects the selected brand, campaign, and date
                            range before building each bucket.
                          </p>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="ghost"
                    className="shrink-0 rounded-full border border-white/12 bg-white/8 px-4 py-1 text-xs text-white/82 shadow-none backdrop-blur-xl hover:bg-white/8 hover:text-white sm:text-sm"
                    onClick={handleOpenLeadsTable}
                    disabled={isPending}
                  >
                    {isPending ? "Loading..." : "Open leads"}
                  </Button>
                </div>
              </div>
              <div className="crm-gpu-layer h-[320px] min-w-0">
                {isMounted ? (
                  <ResponsiveContainer id="timeline-chart" width="100%" height={320}>
                    <LineChart data={timelineData}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke="rgba(255,255,255,0.5)"
                        interval={timelineTickInterval}
                        minTickGap={24}
                        tickFormatter={(value) =>
                          timelineData.find((datum) => datum.date === value)?.label ?? ""
                        }
                      />
                      <YAxis stroke="rgba(255,255,255,0.5)" width={30} tick={{ fontSize: 10 }} />
                      <Tooltip
                        content={<TimelineTooltip activeBrand={brand} />}
                        wrapperStyle={{ zIndex: 9999 }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="leads"
                        stroke={chartPrimary}
                        strokeWidth={3}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : null}
              </div>
            </div>

            <div className="crm-surface-radius border border-white/14 bg-white/10 p-4 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl sm:p-5">
              <div className="mb-3 sm:mb-6">
                <h2 className="text-xl font-semibold">Platform mix</h2>
                <p className="mt-1 text-sm text-white/58">
                  Lead split by DATA platform totals across IG and FB.
                </p>
              </div>
              <div className="crm-gpu-layer h-[320px] min-w-0">
                {platformData.length > 0 && isMounted ? (
                  <ResponsiveContainer id="platform-chart" width="100%" height={320}>
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
                      <Tooltip
                        content={<PlatformTooltip activeBrand={brand} isIndividualTab={brand !== "all" || campaignFilter !== "all"} />}
                        wrapperStyle={{ zIndex: 9999 }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white/58">
                    No platform totals found in the current filters.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="grid items-start gap-3 sm:gap-4 xl:grid-cols-[1.15fr_1fr]">
            <div className="grid gap-4">
              <div className="crm-surface-radius border border-white/14 bg-white/10 p-4 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl sm:p-5">
                <div className="mb-3 sm:mb-6">
                  <h2 className="text-xl font-semibold">Top campaigns</h2>
                  <p className="mt-1 text-sm text-white/58">
                    Descending campaign totals from the DATA summary.
                  </p>
                </div>
                <div className={`crm-gpu-layer ${brand === "redwing" ? "h-[390px]" : "h-[330px]"} min-w-0`}>
                  {campaignData.length > 0 && isMounted ? (
                    <ResponsiveContainer
                      id="campaign-chart"
                      width="100%"
                      height={brand === "redwing" ? 390 : 330}
                    >
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
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white/58">
                      No campaign totals found in the current filters.
                    </div>
                  )}
                </div>
              </div>

              {brand === "all" ? (
                <div className="crm-surface-radius border border-white/14 bg-white/10 p-4 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl sm:p-5">
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold">Today Campaign Leads</h2>
                    <p className="mt-1 text-sm text-white/58">
                      Today&apos;s campaign totals from the latest DATA summary row.
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
                        No leads found for today in DATA.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid gap-4">
              {brand !== "redwing" ? (
                <div className="crm-surface-radius border border-white/14 bg-white/10 p-4 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl sm:p-5">
                  <div className="mb-3 sm:mb-6">
                    <h2 className="text-xl font-semibold">Bigwing Yes / No</h2>
                    <p className="mt-1 text-sm text-white/58">
                      Response count from the DATA Bigwing response arrays.
                    </p>
                  </div>
                  <div className="crm-gpu-layer h-[160px] min-w-0">
                    {bigwingResponseData.length > 0 ? (
                      isMounted ? (
                        <ResponsiveContainer id="bigwing-chart" width="100%" height={160}>
                          <BarChart data={bigwingResponseData} layout="vertical">
                            <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                            <XAxis type="number" stroke="rgba(255,255,255,0.5)" />
                            <YAxis
                              dataKey="response"
                              type="category"
                              width={30}
                              stroke="rgba(255,255,255,0.5)"
                              interval={0}
                              tick={{ fontSize: 10 }}
                            />
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
                        No Bigwing yes / no values found in the filtered summaries.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {brand !== "bigwing" ? (
                <div className="crm-surface-radius border border-white/14 bg-white/10 p-4 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl sm:p-5">
                  <div className="mb-5">
                    <h2 className="text-xl font-semibold">Redwing Locations</h2>
                    <p className="mt-1 text-sm text-white/58">
                      Top Redwing locations from the DATA location count arrays.
                    </p>
                  </div>
                  <div style={{ height: redwingLocationChartHeight }} className="crm-gpu-layer min-w-0">
                    {redwingLocationData.length > 0 ? (
                      isMounted ? (
                        <ResponsiveContainer id="redwing-chart" width="100%" height={redwingLocationChartHeight}>
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
                        No Redwing location values found in the filtered summaries.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {brand !== "all" ? (
                <div className="crm-surface-radius border border-white/14 bg-white/10 p-4 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl sm:p-5">
                  <div className="mb-3 sm:mb-6">
                    <h2 className="text-xl font-semibold">View all leads</h2>
                    <p className="mt-1 text-sm text-white/58">
                      Open the searchable table for every {BRAND_CONFIG[brand].label} lead.
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
            <div className="crm-surface-radius border border-white/14 bg-white/10 p-4 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl sm:p-5">
              <div className="mb-3 sm:mb-6">
                <h2 className="text-xl font-semibold">Digital performance</h2>
                <p className="mt-1 text-sm text-white/58">
                  Trends for actual, contacted, and interested digital leads.
                </p>
              </div>
              <div className="crm-gpu-layer h-[340px] min-w-0">
                {filteredDigitalLeads.length > 0 && isMounted ? (
                  <ResponsiveContainer id="digital-performance-chart" width="100%" height={340}>
                    <LineChart data={filteredDigitalLeads}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke="rgba(255,255,255,0.5)"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(value) => value.split("-").slice(1).join("/")}
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
                      <Line type="monotone" dataKey="actual" name="Actual" stroke="#ffffff" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="contacted" name="Contacted" stroke="#8de0ff" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="interested" name="Interested" stroke="#eefbff" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white/58">
                    No digital performance rows found in the selected date range.
                  </div>
                )}
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
                          <p className="text-[11px] uppercase tracking-[0.22em] text-white/52">
                            Prompt
                          </p>
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

                    <div className="flex flex-wrap items-center justify-end gap-3">
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
