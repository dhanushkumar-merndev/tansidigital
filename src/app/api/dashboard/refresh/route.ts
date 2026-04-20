import { NextResponse } from "next/server";

import { isAuthenticated } from "@/lib/auth";
import { refreshDashboardData } from "@/lib/sheets";

export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
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
