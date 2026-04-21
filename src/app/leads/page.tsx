import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LeadsPageClient } from "@/components/leads-page-client";
import { PinLogin } from "@/components/pin-login";
import { getAuthAccessStatus } from "@/lib/auth";
import { getBrandAssets, type ConcreteBrand, normalizeBrand } from "@/lib/brands";
import { getLeadsPageData, type LeadsPageQuery } from "@/lib/sheets";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeLeadBrand(value: string | null | undefined): ConcreteBrand {
  const brand = normalizeBrand(value);
  return brand === "redwing" ? "redwing" : "bigwing";
}

function normalizeDateParam(value: string | null | undefined) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeSort(value: string | null | undefined): LeadsPageQuery["sort"] {
  return value === "asc" ? "asc" : "desc";
}

function normalizePage(value: string | null | undefined) {
  const page = Number(value);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const brand = normalizeLeadBrand(Array.isArray(params.brand) ? params.brand[0] : params.brand);
  const assets = getBrandAssets(brand);

  return {
    title: `${assets.label} Leads Table`,
    description: `Searchable ${assets.label} leads table powered by your Google Sheets data.`,
    icons: {
      icon: [
        { url: assets.faviconIco },
        { url: assets.favicon16, sizes: "16x16", type: "image/png" },
        { url: assets.favicon32, sizes: "32x32", type: "image/png" },
      ],
      apple: [{ url: assets.appleTouchIcon }],
    },
    manifest: `/brand-manifest?brand=${brand}`,
  };
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialBrand = normalizeLeadBrand(
    Array.isArray(params.brand) ? params.brand[0] : params.brand,
  );
  const authStatus = await getAuthAccessStatus();

  if (!authStatus.isAuthenticated) {
    return <PinLogin />;
  }

  if (authStatus.isAccessPending) {
    redirect("/pending-approval");
  }

  if (authStatus.isAccessBlocked) {
    redirect("/access-blocked");
  }

  const initialQuery: LeadsPageQuery = {
    brand: initialBrand,
    campaigns: Array.from(
      new Set(
        (Array.isArray(params.campaign)
          ? params.campaign
          : params.campaign
            ? [params.campaign]
            : []
        )
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ),
    from: normalizeDateParam(Array.isArray(params.from) ? params.from[0] : params.from),
    page: normalizePage(Array.isArray(params.page) ? params.page[0] : params.page),
    q:
      typeof (Array.isArray(params.q) ? params.q[0] : params.q) === "string"
        ? (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? ""
        : "",
    sort: normalizeSort(Array.isArray(params.sort) ? params.sort[0] : params.sort),
    to: normalizeDateParam(Array.isArray(params.to) ? params.to[0] : params.to),
  };
  const data = await getLeadsPageData(initialQuery);

  return (
    <LeadsPageClient
      data={data}
      initialBrand={initialBrand}
      initialQuery={initialQuery}
    />
  );
}
