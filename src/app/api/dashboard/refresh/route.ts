import { NextResponse } from "next/server";

import { getAuthAccessStatus } from "@/lib/auth";
import { refreshDashboardData } from "@/lib/sheets";

export async function POST() {
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

  const dashboard = await refreshDashboardData();

  if (dashboard.error) {
    return NextResponse.json({ ok: false, error: dashboard.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    tabs: dashboard.tabs.length,
    days: dashboard.dailySummaries.length,
  });
}
