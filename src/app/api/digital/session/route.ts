import { NextResponse } from "next/server";

import {
  buildPinFailureMessage,
  getPinRateLimitStatus,
  registerPinAttempt,
  verifyDigitalPin,
} from "@/lib/auth";
import { getDigitalLeadImportMeta } from "@/lib/sheets";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { pin?: string } | null;
  const pin = body?.pin?.trim() ?? "";
  const rateLimitStatus = await getPinRateLimitStatus("digital", request);

  if (rateLimitStatus.isBlocked) {
    return NextResponse.json(
      { ok: false, error: buildPinFailureMessage("digital PIN", rateLimitStatus) },
      { status: 429 },
    );
  }

  if (!verifyDigitalPin(pin)) {
    const failureStatus = await registerPinAttempt("digital", request, false);

    return NextResponse.json(
      { ok: false, error: buildPinFailureMessage("digital PIN", failureStatus) },
      { status: failureStatus.isBlocked ? 429 : 401 },
    );
  }

  await registerPinAttempt("digital", request, true);

  const meta = await getDigitalLeadImportMeta();

  return NextResponse.json({
    ok: true,
    ...meta,
  });
}
