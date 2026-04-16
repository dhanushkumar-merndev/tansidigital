import { NextResponse } from "next/server";

import { verifyDigitalPin } from "@/lib/auth";
import { getDigitalLeadImportMeta } from "@/lib/sheets";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { pin?: string } | null;
  const pin = body?.pin?.trim() ?? "";

  if (!verifyDigitalPin(pin)) {
    return NextResponse.json({ ok: false, error: "Wrong digital PIN." }, { status: 401 });
  }

  const meta = await getDigitalLeadImportMeta();

  return NextResponse.json({
    ok: true,
    ...meta,
  });
}
