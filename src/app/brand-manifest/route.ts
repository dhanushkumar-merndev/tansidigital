import { NextResponse } from "next/server";

import { getBrandAssets, normalizeBrand } from "@/lib/brands";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const brand = normalizeBrand(url.searchParams.get("brand"));
  const assets = getBrandAssets(brand);
  const label = brand === "all" ? "Bigwing + Redwing Dashboard" : `${assets.label} Dashboard`;

  return new NextResponse(
    JSON.stringify({
      name: label,
      short_name: brand === "all" ? "BW+RW" : assets.label,
      description: "Brand-aware campaign analytics dashboard",
      display: "standalone",
      background_color: "#120d0b",
      theme_color: assets.manifestColor,
      icons: [
        {
          src: assets.favicon32,
          sizes: "32x32",
          type: "image/png",
        },
        {
          src:
            brand === "redwing"
              ? "/redwing/android-chrome-redwing-192x192.png"
              : "/bigwing/android-chrome-bigwing-192x192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src:
            brand === "redwing"
              ? "/redwing/android-chrome-redwing-512x512.png"
              : "/bigwing/android-chrome-bigwing-512x512.png",
          sizes: "512x512",
          type: "image/png",
        },
      ],
    }),
    {
      headers: {
        "Content-Type": "application/manifest+json",
      },
    },
  );
}
