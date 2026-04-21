
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardClient } from "@/components/dashboard-client";
import { PinLogin } from "@/components/pin-login";
import { getAuthAccessStatus } from "@/lib/auth";
import { getBrandAssets, normalizeBrand } from "@/lib/brands";
import { getDashboardData } from "@/lib/sheets";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const brand = normalizeBrand(
    Array.isArray(params.brand) ? params.brand[0] : params.brand,
  );
  const assets = getBrandAssets(brand);
  const title =
    brand === "all"
      ? "Bigwing + Redwing Analytics Dashboard"
      : `${assets.label} Analytics Dashboard`;

  return {
    title,
    description: "Brand-aware campaign dashboard with PIN access and live Google Sheets analytics.",
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

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialBrand = normalizeBrand(
    Array.isArray(params.brand) ? params.brand[0] : params.brand,
  );
  const authStatus = await getAuthAccessStatus({ forceAccessRefresh: true });

  if (!authStatus.isAuthenticated) {
    return <PinLogin />;
  }

  if (authStatus.isAccessBlocked || authStatus.isAccessPending) {
    redirect(
      authStatus.isAccessPending
        ? "/access-blocked?state=pending"
        : "/access-blocked?state=blocked",
    );
  }

  const workbook = await getDashboardData();

  return <DashboardClient workbook={workbook} initialBrand={initialBrand} />;
}
