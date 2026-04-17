import { createHmac } from "node:crypto";

export type MetaCampaignSpendEntry = {
  accountCurrency: string;
  campaignName: string;
  dateStart: string;
  dateStop: string;
  spend: number;
};

type MetaInsightsResponse = {
  data?: Array<{
    account_currency?: unknown;
    campaign_name?: unknown;
    date_start?: unknown;
    date_stop?: unknown;
    spend?: unknown;
  }>;
  error?: {
    message?: string;
  };
  paging?: {
    next?: string;
  };
};

const META_API_VERSION = process.env.META_API_VERSION?.trim() || "v22.0";
const META_API_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

function getMetaAccessToken() {
  return process.env.META_ACCESS_TOKEN?.trim() ?? "";
}

function getMetaAdAccountId() {
  return process.env.META_AD_ACCOUNT_ID?.trim() ?? "";
}

function getMetaAppSecret() {
  return process.env.META_APP_SECRET?.trim() ?? "";
}

function normalizeMetaDate(value: string, label: string) {
  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid ${label} date "${value}". Use YYYY-MM-DD.`);
  }

  return trimmed;
}

function buildAppSecretProof(accessToken: string, appSecret: string) {
  if (!appSecret) return "";

  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

function parseSpendValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]+/g, "").trim();

    if (!cleaned) {
      return 0;
    }

    const parsed = Number.parseFloat(cleaned);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export function isMetaInsightsConfigured() {
  return Boolean(getMetaAccessToken() && getMetaAdAccountId());
}

export async function fetchMetaCampaignSpend({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const accessToken = getMetaAccessToken();
  const adAccountId = getMetaAdAccountId();

  if (!accessToken || !adAccountId) {
    throw new Error("META_ACCESS_TOKEN and META_AD_ACCOUNT_ID are required.");
  }

  const appSecretProof = buildAppSecretProof(accessToken, getMetaAppSecret());
  const normalizedFrom = normalizeMetaDate(from, "from");
  const normalizedTo = normalizeMetaDate(to, "to");

  let nextUrl: URL | null = new URL(`${META_API_BASE_URL}/${adAccountId}/insights`);
  nextUrl.searchParams.set(
    "fields",
    "account_currency,campaign_name,date_start,date_stop,spend",
  );
  nextUrl.searchParams.set("level", "campaign");
  nextUrl.searchParams.set("time_increment", "1");
  nextUrl.searchParams.set("limit", "500");
  nextUrl.searchParams.set(
    "time_range",
    JSON.stringify({
      since: normalizedFrom,
      until: normalizedTo,
    }),
  );
  nextUrl.searchParams.set("access_token", accessToken);

  if (appSecretProof) {
    nextUrl.searchParams.set("appsecret_proof", appSecretProof);
  }

  const entries: MetaCampaignSpendEntry[] = [];

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as MetaInsightsResponse | null;
    const errorMessage = payload?.error?.message;

    if (!response.ok || errorMessage) {
      throw new Error(errorMessage || "Meta Insights request failed.");
    }

    for (const row of payload?.data ?? []) {
      entries.push({
        accountCurrency:
          typeof row.account_currency === "string" && row.account_currency.trim()
            ? row.account_currency.trim().toUpperCase()
            : "INR",
        campaignName: typeof row.campaign_name === "string" ? row.campaign_name.trim() : "",
        dateStart: typeof row.date_start === "string" ? row.date_start.trim() : "",
        dateStop: typeof row.date_stop === "string" ? row.date_stop.trim() : "",
        spend: parseSpendValue(row.spend),
      });
    }

    nextUrl =
      payload?.paging?.next && typeof payload.paging.next === "string"
        ? new URL(payload.paging.next)
        : null;
  }

  return entries;
}
