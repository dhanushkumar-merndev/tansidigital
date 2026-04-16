"use client";

import { ArrowLeft, ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

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

export function LeadsPageClient({ workbook, initialBrand }: LeadsPageClientProps) {
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
  const deferredSearch = React.useDeferredValue(searchTerm);
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
    .sort((a, b) => {
      const left = b.date ?? "";
      const right = a.date ?? "";
      return left.localeCompare(right);
    });

  function handleBrandChange(nextBrand: ConcreteBrand) {
    setBrand(nextBrand);
    const nextSearch = new URLSearchParams(searchParams.toString());
    nextSearch.set("brand", nextBrand);
    React.startTransition(() => {
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

  return (
    <div className="min-h-screen bg-[#0D4D8B] text-white transition-[background-color] duration-500 ease-out">
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
                    >
                      <Link href={`/?brand=${brand}`}>
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back
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
                            ? "min-w-[80px] sm:min-w-[104px] rounded-full border border-white/70 bg-white px-3 sm:px-5 py-1 text-xs sm:text-sm font-medium text-[#8f313a] shadow-[0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl hover:bg-white hover:text-[#8f313a]"
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
           
              <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-semibold">Lead table</h2>
                  </div>
                  <p className="mt-0.5 text-sm text-white/58">
                    {selectedCampaigns.length === 0
                      ? "Showing all campaigns"
                      : `Filtered by: ${selectedCampaigns.join(", ")}`}
                  </p>
                </div>

                <div className="w-full max-w-xl">
                  <Field>
                    <FieldLabel htmlFor="lead-search">Search Leads</FieldLabel>
                    <div className="relative h-[48px] rounded-[22px] border border-white/16 bg-white/10">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/44" />
                      <input
                        id="lead-search"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Search name, phone, campaign, ad, location..."
                        autoComplete="off"
                        className="h-[48px] w-full rounded-[22px] bg-transparent pl-11 pr-4 text-sm text-white outline-none placeholder:text-white/34"
                      />
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
                      ? "shrink-0 rounded-full border border-white/70 bg-white px-4 py-0.5 font-medium text-[#8f313a] shadow-[0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl hover:bg-white hover:text-[#8f313a]"
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
                          ? "shrink-0 rounded-full border border-white/70 bg-white px-4 py-0.5 font-medium text-[#8f313a] shadow-[0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl hover:bg-white hover:text-[#8f313a]"
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

            <div className="overflow-hidden rounded-[18px] border border-white/10 bg-[#1f1413]/40">
              <div className="max-h-[70vh] overflow-auto pr-1 [scrollbar-color:rgba(255,255,255,0.24)_rgba(255,255,255,0.06)] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/6 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-[1px] [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-white/24 [&::-webkit-scrollbar-thumb]:bg-clip-padding hover:[&::-webkit-scrollbar-thumb]:bg-white/34">
                <table className="w-full min-w-[900px] border-collapse text-left">
                  <thead className="sticky top-0 z-10 bg-[#3f2527]/92 backdrop-blur-xl">
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
                    {rows.length > 0 ? (
                      rows.map((row, rowIndex) => (
                        <tr key={row.id} className="border-b border-white/8 last:border-b-0">
                          <td className="px-4 py-3 align-top text-sm tabular-nums text-white/52">
                            {rowIndex + 1}
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
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
