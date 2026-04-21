import { NextResponse } from "next/server";

import { getAuthAccessStatus } from "@/lib/auth";
import { fetchMetaCampaignSpend, isMetaInsightsConfigured } from "@/lib/meta";

type SpendBody = {
  campaigns?: unknown;
  from?: unknown;
  to?: unknown;
};

type RequestedCampaign = {
  aliases: string[];
  aliasKeys: string[];
  key: string;
  label: string;
};

function normalizeCampaignKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isValidDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeRequestedCampaigns(input: unknown): RequestedCampaign[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const requestedCampaigns: RequestedCampaign[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    let label = "";
    let aliases: string[] = [];

    if (typeof item === "string") {
      label = item.trim();
      aliases = label ? [label] : [];
    } else if (item && typeof item === "object") {
      const candidate = item as {
        aliases?: unknown;
        label?: unknown;
        name?: unknown;
      };
      label =
        typeof candidate.label === "string"
          ? candidate.label.trim()
          : typeof candidate.name === "string"
            ? candidate.name.trim()
            : "";
      aliases = Array.isArray(candidate.aliases)
        ? candidate.aliases
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
    }

    if (!label) {
      continue;
    }

    const mergedAliases = Array.from(new Set([label, ...aliases]));
    const aliasKeys = mergedAliases.map((value) => normalizeCampaignKey(value));
    const key = normalizeCampaignKey(label);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    requestedCampaigns.push({
      aliases: mergedAliases,
      aliasKeys,
      key,
      label,
    });
  }

  return requestedCampaigns.slice(0, 250);
}

function matchesCampaign(requestedCampaigns: RequestedCampaign[], campaignName: string) {
  const normalizedCampaignName = normalizeCampaignKey(campaignName);

  for (const requestedCampaign of requestedCampaigns) {
    for (const aliasKey of requestedCampaign.aliasKeys) {
      if (
        aliasKey === normalizedCampaignName ||
        normalizedCampaignName.includes(aliasKey) ||
        aliasKey.includes(normalizedCampaignName)
      ) {
        return true;
      }
    }
  }

  return false;
}

function findBestCampaignMatch(
  requestedCampaigns: RequestedCampaign[],
  campaignName: string,
) {
  const normalizedCampaignName = normalizeCampaignKey(campaignName);

  // 1. Exact match against any alias keys
  const exactMatch = requestedCampaigns.find((campaign) =>
    campaign.aliasKeys.includes(normalizedCampaignName),
  );
  if (exactMatch) return exactMatch;

  // 2. Exact match after stripping common suffixes/punctuation
  const cleanedCampaignName = normalizedCampaignName
    .replace(/[-_:.\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const cleanedExactMatch = requestedCampaigns.find((campaign) =>
    campaign.aliasKeys.some((alias) => {
      const cleanedAlias = alias
        .replace(/[-_:.\|]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return cleanedAlias === cleanedCampaignName;
    }),
  );
  if (cleanedExactMatch) return cleanedExactMatch;

  // 3. Partial matches (prioritizing longest alias first for precision)
  const partialMatches = requestedCampaigns
    .filter((campaign) =>
      campaign.aliasKeys.some(
        (aliasKey) =>
          normalizedCampaignName.includes(aliasKey) ||
          aliasKey.includes(normalizedCampaignName),
      ),
    )
    .sort((left, right) => {
      const longestLeft = Math.max(...left.aliasKeys.map((k) => k.length));
      const longestRight = Math.max(...right.aliasKeys.map((k) => k.length));
      return longestRight - longestLeft;
    });

  return partialMatches[0] ?? null;
}

export async function POST(request: Request) {
  const authStatus = await getAuthAccessStatus();

  if (!authStatus.isAuthenticated) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  if (authStatus.isAccessBlocked || authStatus.isAccessPending) {
    return NextResponse.json(
      {
        ok: false,
        error: authStatus.isAccessPending ? "Access pending approval." : "Access blocked.",
      },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as SpendBody | null;
  const from = typeof body?.from === "string" ? body.from.trim() : "";
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  const requestedCampaigns = normalizeRequestedCampaigns(body?.campaigns);

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
      campaigns: [],
      currency: "INR",
      matchedCampaigns: 0,
      requestedCampaigns: requestedCampaigns.length,
      totalSpend: 0,
    });
  }

  if (requestedCampaigns.length === 0) {
    return NextResponse.json({
      ok: true,
      configured: true,
      campaigns: [],
      currency: "INR",
      matchedCampaigns: 0,
      requestedCampaigns: 0,
      totalSpend: 0,
    });
  }

  try {
    const spendRows = await fetchMetaCampaignSpend({ from, to });
    let currency = "INR";
    let totalSpend = 0;
    const spendByCampaign = new Map<
      string,
      { name: string; spend: number; cpc: number; currency: string }
    >();

    for (const row of spendRows) {
      if (
        !row.campaignName ||
        !matchesCampaign(requestedCampaigns, row.campaignName)
      ) {
        continue;
      }

      const matchedCampaign = findBestCampaignMatch(
        requestedCampaigns,
        row.campaignName,
      );
      if (!matchedCampaign) {
        continue;
      }

      totalSpend += row.spend;
      currency = row.accountCurrency || currency;

      const existingCampaign =
        spendByCampaign.get(matchedCampaign.key) ?? {
          name: matchedCampaign.label,
          cpc: 0,
          spend: 0,
          currency: row.accountCurrency || "INR",
        };
      existingCampaign.cpc += row.cpc;
      existingCampaign.spend += row.spend;
      existingCampaign.currency = row.accountCurrency || existingCampaign.currency;
      spendByCampaign.set(matchedCampaign.key, existingCampaign);
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      campaigns: Array.from(spendByCampaign.values()).sort(
        (left, right) => right.spend - left.spend,
      ),
      currency,
      matchedCampaigns: spendByCampaign.size,
      requestedCampaigns: requestedCampaigns.length,
      totalSpend,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch Meta campaign spend right now.";

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
