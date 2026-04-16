export type Brand = "all" | "bigwing" | "redwing";
export type ConcreteBrand = Exclude<Brand, "all">;

type BrandConfig = {
  label: string;
  shortLabel: string;
  logo: string;
  faviconIco: string;
  favicon16: string;
  favicon32: string;
  appleTouchIcon: string;
  manifestColor: string;
  background: string;
  accent: string;
  muted: string;
};

export const BRAND_CONFIG: Record<ConcreteBrand, BrandConfig> = {
  bigwing: {
    label: "Bigwing",
    shortLabel: "BIG",
    logo: "/bigwing/logo-bigwing.webp",
    faviconIco: "/bigwing/bigwing.ico",
    favicon16: "/bigwing/favicon-bigwing-16x16.png",
    favicon32: "/bigwing/favicon-bigwing-32x32.png",
    appleTouchIcon: "/bigwing/apple-touch-icon-bigwing.png",
    manifestColor: "#c8783d",
    background: "from-[#3e171b] via-[#892a31] to-[#f09995]",
    accent: "#f1b16d",
    muted: "#f7e0c7",
  },
  redwing: {
    label: "Redwing",
    shortLabel: "RED",
    logo: "/redwing/logo-redwing.webp",
    faviconIco: "/redwing/redwing.ico",
    favicon16: "/redwing/favicon-redwing-16x16.png",
    favicon32: "/redwing/favicon-redwing-32x32.png",
    appleTouchIcon: "/redwing/apple-touch-icon-redwing.png",
    manifestColor: "#ac3a3e",
    background: "from-[#3e171b] via-[#892a31] to-[#f09995]",
    accent: "#f07b80",
    muted: "#f8d5d6",
  },
};

export function normalizeBrand(value: string | null | undefined): Brand {
  const input = value?.toLowerCase().trim();

  if (input === "bigwing") return "bigwing";
  if (input === "redwing") return "redwing";
  return "all";
}

export function inferBrand(...values: Array<string | null | undefined>): ConcreteBrand | null {
  for (const raw of values) {
    const value = raw?.toLowerCase();
    if (!value) continue;
    if (value.includes("bigwing")) return "bigwing";
    if (value.includes("redwing")) return "redwing";
  }

  return null;
}

export function getBrandAssets(brand: Brand): BrandConfig {
  if (brand === "bigwing") return BRAND_CONFIG.bigwing;
  return BRAND_CONFIG.redwing;
}
