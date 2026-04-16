"use client";

import { endOfDay, isAfter, isBefore, startOfDay, subDays } from "date-fns";
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
  BarChart3,
  ChevronDown,
  Layers3,
  LogOut,
  Search,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
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
  organicLeads: number;
  platforms: number;
};

const brandOptions: Brand[] = ["all", "bigwing", "redwing"];

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
          className="w-[var(--radix-popover-trigger-width)] rounded-[22px] border border-white/14 bg-[#4a262b]/96 p-2 text-white shadow-[0_20px_60px_rgba(15,5,7,0.32)] ring-0 backdrop-blur-xl"
        >
          <div className="max-h-[280px] space-y-1 overflow-y-auto pr-1">
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
                      ? "w-full rounded-[14px] bg-[#a33340] px-4 py-2.5 text-left text-sm text-white"
                      : "w-full rounded-[14px] px-4 py-2.5 text-left text-sm text-white/88 transition hover:bg-white hover:text-[#5e2329]"
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

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
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

function summarizeRows(rows: DashboardRow[]): Summary {
  const totalLeads = rows.length;
  const uniquePhones = getUniquePhoneCampaignCount(rows);
  const campaigns = new Set(rows.map((row) => row.campaign).filter(Boolean)).size;
  const tabs = new Set(rows.map((row) => row.tabName).filter(Boolean)).size;
  const organicLeads = rows.filter((row) => row.isOrganic).length;
  const platforms = new Set(rows.map((row) => row.platform).filter(Boolean)).size;

  return {
    totalLeads,
    uniquePhones,
    campaigns,
    tabs,
    organicLeads,
    platforms,
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
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    // Small delay to ensure browser layout is stable before charts measure
    const timer = setTimeout(() => setIsMounted(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [brand, setBrand] = React.useState<Brand>(initialBrand);
  const [campaignFilter, setCampaignFilter] = React.useState("all");
  const [searchTerm, setSearchTerm] = React.useState("");
  const deferredSearch = React.useDeferredValue(searchTerm);
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
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

  const brandRows = workbook.rows.filter((row) => {
    if (brand === "all") return true;
    return row.brand === brand;
  });

  const todayIst = getIstDateKey(new Date());

  const campaigns = Array.from(new Set(brandRows.map((row) => row.campaign).filter(Boolean))).sort();

  const filteredRows = brandRows.filter((row) => {
    const rowDate = parseDate(row.date);
    const from = dateRange?.from ? startOfDay(dateRange.from) : null;
    const to = dateRange?.to ? endOfDay(dateRange.to) : null;
    const outOfRange =
      (from && rowDate && isBefore(rowDate, from)) || (to && rowDate && isAfter(rowDate, to));

    if (outOfRange) return false;
    if (campaignFilter !== "all" && row.campaign !== campaignFilter) return false;
    if (deferredSearch && !row.adName.toLowerCase().includes(deferredSearch.toLowerCase())) {
      return false;
    }

    return true;
  });

  const summary = summarizeRows(filteredRows);

  const todayCampaignRows = brandRows.filter((row) => {
    if (!isRowInIstDate(row, todayIst)) return false;
    if (deferredSearch && !row.adName.toLowerCase().includes(deferredSearch.toLowerCase())) {
      return false;
    }

    return true;
  });

  const todayCampaignData = Array.from(
    todayCampaignRows.reduce<Map<string, number>>((map, row) => {
      const key = row.campaign || "Unknown";
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map()),
  )
    .map(([campaign, leads]) => ({ campaign, leads }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 2);

  const timelineMap = new Map<string, { date: string; leads: number; uniquePhones: number }>();
  for (const row of filteredRows) {
    const key = row.date ?? "Unknown";
    const bucket = timelineMap.get(key) ?? { date: key, leads: 0, uniquePhones: 0 };
    bucket.leads += 1;
    timelineMap.set(key, bucket);
  }
  const timelineData = Array.from(timelineMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const campaignMap = new Map<string, number>();
  const platformMap = new Map<string, number>();
  const locationMap = new Map<string, number>();
  const bigwingResponseMap = new Map<string, number>();
  const redwingLocationMap = new Map<string, number>();

  for (const row of filteredRows) {
    campaignMap.set(row.campaign || "Unknown", (campaignMap.get(row.campaign || "Unknown") ?? 0) + 1);
    platformMap.set(row.platform || "unknown", (platformMap.get(row.platform || "unknown") ?? 0) + 1);
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

  const platformData = Array.from(platformMap.entries()).map(([name, value]) => ({
    name: name.toUpperCase(),
    value,
  }));

  const bigwingResponseData = Array.from(bigwingResponseMap.entries())
    .map(([response, leads]) => ({ response, leads }))
    .sort((a, b) => b.leads - a.leads);

  const locationData = Array.from(locationMap.entries())
    .map(([location, leads]) => ({ location, leads }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 8);

  const redwingLocationData = Array.from(redwingLocationMap.entries())
    .map(([location, leads]) => ({ location, leads }))
    .sort((a, b) => b.leads - a.leads);

  const redwingLocationChartHeight = Math.max(
    brand === "redwing" ? 180 : 220,
    redwingLocationData.length * (brand === "redwing" ? 32 : 42),
  );

  const pieColors = ["#f07b80", "#8de0ff", "#f3d0a6", "#c5b3ff", "#8ff0c4"];

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  function handleBrandChange(nextBrand: Brand) {
    setBrand(nextBrand);
    const nextSearch = new URLSearchParams(searchParams.toString());
    nextSearch.set("brand", nextBrand);
    React.startTransition(() => {
      router.replace(`${pathname}?${nextSearch.toString()}`, { scroll: false });
    });
  }

  const activeBrandAssets = getBrandAssets(brand);

  return (
    <div className={`min-h-screen bg-[#1a0a0c] bg-gradient-to-br ${activeBrandAssets.background} text-white`}>
      <div className="min-h-screen bg-[linear-gradient(180deg,rgba(10,7,5,0.18),rgba(10,7,5,0.72))]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
          <section className="rounded-[34px] border border-white/14 bg-white/10 p-4 sm:p-5 shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-white/65">
                  <Sparkles className="h-3.5 w-3.5" />
                  {brand === "all" ? "Combined Dashboard" : `${activeBrandAssets.label} Dashboard`}
                </div>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Campaign analytics command center</h1>
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
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {brandOptions.map((option) => {
                    const selected = option === brand;
                    const label = option === "all" ? "All" : BRAND_CONFIG[option].label;

                    return (
                      <Button
                        key={option}
                        variant="ghost"
                        className={
                          selected
                            ? "min-w-[80px] sm:min-w-[104px] rounded-full border border-white/40 bg-white/24 px-3 sm:px-5 py-1 text-xs sm:text-sm font-medium text-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl hover:bg-white/28 hover:text-white"
                            : "min-w-[80px] sm:min-w-[104px] rounded-full border border-white/10 bg-white/6 px-3 sm:px-5 py-1 text-xs sm:text-sm text-white/62 shadow-none backdrop-blur-xl hover:bg-white/10 hover:text-white"
                        }
                        onClick={() => handleBrandChange(option)}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    className="gap-2 rounded-full border border-white/12 bg-white/8 px-4 sm:px-5 py-1 text-xs sm:text-sm text-white/82 shadow-none backdrop-blur-xl hover:bg-white/8 hover:text-white"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 rounded-[34px] border border-white/14 bg-white/10 p-5 backdrop-blur-2xl lg:grid-cols-[1.2fr_0.9fr_1.8fr]">
            <DateRangePicker date={dateRange} onSelect={setDateRange} />

            <FilterSelect
              id="campaign-filter"
              label="Campaign"
              value={campaignFilter}
              onChange={setCampaignFilter}
              disabled={brand === "all"}
              options={[{ value: "all", label: "All campaigns" }, ...campaigns.map((campaign) => ({ value: campaign, label: campaign }))]}
            />

            <Field>
              <FieldLabel htmlFor="ad-search">Search Ad Name</FieldLabel>
              <div className="relative h-[48px] rounded-[22px] border border-white/16 bg-white/10">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/44" />
                <input
                  id="ad-search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Type ad name..."
                  autoComplete="off"
                  className="h-[48px] w-full rounded-[22px] bg-transparent pl-11 pr-4 text-sm text-white outline-none placeholder:text-white/34"
                />
              </div>
            </Field>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Total Leads", value: formatCompactNumber(summary.totalLeads), hint: "Filtered lead rows", icon: Users },
              { label: "Unique Phones", value: formatCompactNumber(summary.uniquePhones), hint: "Distinct phone + campaign pairs", icon: Target },
              { label: "Campaigns", value: formatCompactNumber(summary.campaigns), hint: `${summary.tabs} active tabs`, icon: Layers3 },
              { label: "Platforms", value: formatCompactNumber(summary.platforms), hint: `${summary.organicLeads} organic leads`, icon: BarChart3 },
            ].map((card) => (
              <div key={card.label} className="rounded-[24px] border border-white/14 bg-white/10 p-3.5 sm:p-5 shadow-[0_20px_80px_rgba(5,5,5,0.18)] backdrop-blur-xl transition-all">
                <div className="mb-2 sm:mb-6 flex items-center justify-between">
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

          <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <div className="rounded-[34px] border border-white/14 bg-white/10 p-5 backdrop-blur-2xl">
              <div className="mb-6">
                <h2 className="text-xl font-semibold">Lead timeline</h2>
                <p className="mt-1 text-sm text-white/58">Daily lead volume from `created_time`.</p>
              </div>
                <div className="h-[320px]">
                  {isMounted ? (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                      <LineChart data={timelineData}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" tickFormatter={(value) => value.slice(5)} />
                        <YAxis stroke="rgba(255,255,255,0.5)" />
                        <Tooltip contentStyle={{ backgroundColor: "#1a120d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "18px", color: "#fff" }} />
                        <Legend />
                        <Line type="monotone" dataKey="leads" stroke="#ff9ca3" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : null}
                </div>
            </div>

            <div className="rounded-[34px] border border-white/14 bg-white/10 p-5 backdrop-blur-2xl">
              <div className="mb-6">
                <h2 className="text-xl font-semibold">Platform mix</h2>
                <p className="mt-1 text-sm text-white/58">Lead split by platform values from your sheet.</p>
              </div>
                <div className="h-[320px]">
                  {isMounted ? (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
                        <Tooltip contentStyle={{ backgroundColor: "#1a120d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "18px", color: "#fff" }} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : null}
                </div>
            </div>
          </section>

          <section className="grid items-start gap-4 xl:grid-cols-[1.15fr_1fr]">
            <div className="grid gap-4">
              <div className="rounded-[34px] border border-white/14 bg-white/10 p-5 backdrop-blur-2xl">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold">Top campaigns</h2>
                  <p className="mt-1 text-sm text-white/58">Lead count by campaign name.</p>
                </div>
                <div className={brand === "redwing" ? "h-[390px]" : "h-[330px]"}>
                  {isMounted ? (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                      <BarChart data={campaignData}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="campaign" stroke="rgba(255,255,255,0.5)" interval={0} tick={{ fontSize: 10 }} />
                        <YAxis stroke="rgba(255,255,255,0.5)" />
                        <Tooltip contentStyle={{ backgroundColor: "#1a120d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "18px", color: "#fff" }} />
                        <Legend />
                        <Bar dataKey="leads" fill={activeBrandAssets.accent} radius={[12, 12, 0, 0]} activeBar={{ stroke: "none" }} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : null}
                </div>
              </div>

              {brand === "all" ? (
                <div className="rounded-[34px] border border-white/14 bg-white/10 p-5 backdrop-blur-2xl">
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
                <div className="rounded-[34px] border border-white/14 bg-white/10 p-5 backdrop-blur-2xl">
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold">Bigwing Yes / No</h2>
                    <p className="mt-1 text-sm text-white/58">Response count from the Bigwing whitefield / hoodi question.</p>
                  </div>
                  <div className="h-[160px]">
                    {bigwingResponseData.length > 0 ? (
                      isMounted ? (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                          <BarChart data={bigwingResponseData} layout="vertical" margin={{ left: 0, right: 0 }}>
                            <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                            <XAxis type="number" stroke="rgba(255,255,255,0.5)" />
                            <YAxis dataKey="response" type="category" width={36} stroke="rgba(255,255,255,0.5)" interval={0} />
                            <Tooltip contentStyle={{ backgroundColor: "#1a120d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "18px", color: "#fff" }} />
                            <Bar dataKey="leads" fill={activeBrandAssets.accent} radius={[0, 12, 12, 0]} activeBar={{ stroke: "none" }} />
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
                <div className="rounded-[34px] border border-white/14 bg-white/10 p-5 backdrop-blur-2xl">
                  <div className="mb-5">
                    <h2 className="text-xl font-semibold">Redwing Locations</h2>
                    <p className="mt-1 text-sm text-white/58">Top Redwing location values from the filtered rows.</p>
                  </div>
                  <div style={{ height: redwingLocationChartHeight }}>
                    {redwingLocationData.length > 0 ? (
                      isMounted ? (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                          <BarChart
                            data={redwingLocationData}
                            layout="vertical"
                            barSize={brand === "redwing" ? 18 : 28}
                          >
                            <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                            <XAxis type="number" stroke="rgba(255,255,255,0.5)" />
                            <YAxis dataKey="location" type="category" width={120} stroke="rgba(255,255,255,0.5)" interval={0} />
                            <Tooltip contentStyle={{ backgroundColor: "#1a120d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "18px", color: "#fff" }} />
                            <Bar dataKey="leads" fill="#f07b80" radius={[0, 12, 12, 0]} activeBar={{ stroke: "none" }} />
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
                <div className="rounded-[34px] border border-white/14 bg-white/10 p-5 backdrop-blur-2xl">
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold">View all leads</h2>
                    <p className="mt-1 text-sm text-white/58">
                      Open a searchable glass table for every {BRAND_CONFIG[brand].label} lead.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    className="rounded-full border border-white/12 bg-white/8 px-5 py-1 text-white/82 shadow-none backdrop-blur-xl hover:bg-white/8 hover:text-white"
                    onClick={() => router.push(`/leads?brand=${brand}`)}
                  >
                    Open leads table
                  </Button>
                </div>
              ) : null}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
