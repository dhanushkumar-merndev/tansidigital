import { NextResponse } from "next/server";

import { getAuthAccessStatus } from "@/lib/auth";
import { refreshDashboardData } from "@/lib/sheets";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function POST() {
  const authStatus = await getAuthAccessStatus();

  if (!authStatus.isAuthenticated) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { headers: NO_STORE_HEADERS, status: 401 },
    );
  }

  if (authStatus.isAccessBlocked || authStatus.isAccessPending) {
    return NextResponse.json(
      {
        ok: false,
        error: authStatus.isAccessPending ? "Access pending approval." : "Access blocked.",
      },
      { headers: NO_STORE_HEADERS, status: 403 },
    );
  }

  const dashboard = await refreshDashboardData();

  if (dashboard.error) {
    return NextResponse.json(
      { ok: false, error: dashboard.error },
      { headers: NO_STORE_HEADERS, status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    tabs: dashboard.tabs.length,
    days: dashboard.dailySummaries.length,
  }, { headers: NO_STORE_HEADERS });
}
