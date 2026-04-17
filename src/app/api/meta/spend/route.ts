import { NextResponse } from "next/server";

import { isAuthenticated } from "@/lib/auth";
import { fetchMetaCampaignSpend, isMetaInsightsConfigured } from "@/lib/meta";

type SpendBody = {
  campaigns?: unknown;
  from?: unknown;
  to?: unknown;
};

function normalizeCampaignKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isValidDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeCampaigns(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  return Array.from(
    new Set(
      input
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, 250);
}

function matchesCampaign(requestedCampaigns: Set<string>, campaignName: string) {
  const normalizedCampaignName = normalizeCampaignKey(campaignName);

  if (requestedCampaigns.has(normalizedCampaignName)) {
    return true;
  }

  for (const requestedCampaign of requestedCampaigns) {
    if (
      normalizedCampaignName.includes(requestedCampaign) ||
      requestedCampaign.includes(normalizedCampaignName)
    ) {
      return true;
    }
  }

  return false;
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as SpendBody | null;
  const from = typeof body?.from === "string" ? body.from.trim() : "";
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  const campaigns = normalizeCampaigns(body?.campaigns);

  if (!isValidDateValue(from) || !isValidDateValue(to)) {
    return NextResponse.json(
      { ok: false, error: "A valid from/to date is required in YYYY-MM-DD format." },
      { status: 400 },
    );
  }

  if (!isMetaInsightsConfigured()) {
    return NextResponse.json({
      ok: true,
      configured: false,
      currency: "INR",
      matchedCampaigns: 0,
      requestedCampaigns: campaigns.length,
      totalSpend: 0,
    });
  }

  if (campaigns.length === 0) {
    return NextResponse.json({
      ok: true,
      configured: true,
      currency: "INR",
      matchedCampaigns: 0,
      requestedCampaigns: 0,
      totalSpend: 0,
    });
  }

  try {
    const requestedCampaigns = new Set(campaigns.map((campaign) => normalizeCampaignKey(campaign)));
    const spendRows = await fetchMetaCampaignSpend({ from, to });
    let currency = "INR";
    let totalSpend = 0;
    const matchedCampaigns = new Set<string>();

    for (const row of spendRows) {
      if (!row.campaignName || !matchesCampaign(requestedCampaigns, row.campaignName)) {
        continue;
      }

      totalSpend += row.spend;
      currency = row.accountCurrency || currency;
      matchedCampaigns.add(normalizeCampaignKey(row.campaignName));
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      currency,
      matchedCampaigns: matchedCampaigns.size,
      requestedCampaigns: campaigns.length,
      totalSpend,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch Meta campaign spend right now.";

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
