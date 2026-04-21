import { NextResponse } from "next/server";

import { getAuthAccessStatus } from "@/lib/auth";
import { getDashboardData } from "@/lib/sheets";

export async function GET() {
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

  const dashboard = await getDashboardData();
  return NextResponse.json(dashboard);
}
