import { NextResponse } from "next/server";

import { getAuthAccessStatus } from "@/lib/auth";
import { normalizeBrand, type ConcreteBrand } from "@/lib/brands";
import { getLeadsPageData, type LeadsPageQuery } from "@/lib/sheets";

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

export async function GET(request: Request) {
  const authStatus = await getAuthAccessStatus({ forceAccessRefresh: true });

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

  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const query: LeadsPageQuery = {
    brand: normalizeLeadBrand(searchParams.get("brand")),
    campaigns: Array.from(
      new Set(
        searchParams
          .getAll("campaign")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ),
    from: normalizeDateParam(searchParams.get("from")),
    page: normalizePage(searchParams.get("page")),
    q: searchParams.get("q")?.trim() ?? "",
    sort: normalizeSort(searchParams.get("sort")),
    to: normalizeDateParam(searchParams.get("to")),
  };

  const data = await getLeadsPageData(query);

  return NextResponse.json(data);
}
