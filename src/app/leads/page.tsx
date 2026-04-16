import type { Metadata } from "next";

import { LeadsPageClient } from "@/components/leads-page-client";
import { PinLogin } from "@/components/pin-login";
import { isAuthenticated } from "@/lib/auth";
import { getBrandAssets, type ConcreteBrand, normalizeBrand } from "@/lib/brands";
import { getWorkbookData } from "@/lib/sheets";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const dynamic = "force-dynamic";

function normalizeLeadBrand(value: string | null | undefined): ConcreteBrand {
  const brand = normalizeBrand(value);
  return brand === "redwing" ? "redwing" : "bigwing";
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
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    return <PinLogin />;
  }

  const workbook = await getWorkbookData();

  return <LeadsPageClient workbook={workbook} initialBrand={initialBrand} />;
}
