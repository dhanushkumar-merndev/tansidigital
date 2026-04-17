import { NextResponse } from "next/server";

import { isAuthenticated } from "@/lib/auth";
import { refreshWorkbookData } from "@/lib/sheets";

export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const workbook = await refreshWorkbookData();

  if (workbook.error) {
    return NextResponse.json({ ok: false, error: workbook.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    tabs: workbook.tabs.length,
    rows: workbook.rows.length,
  });
}
