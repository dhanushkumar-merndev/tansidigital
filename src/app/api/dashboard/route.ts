import { NextResponse } from "next/server";

import { getAuthAccessStatus } from "@/lib/auth";
import { getDashboardData } from "@/lib/sheets";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET() {
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

  const dashboard = await getDashboardData();
  return NextResponse.json(dashboard, { headers: NO_STORE_HEADERS });
}
