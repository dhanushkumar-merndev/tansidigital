import { NextResponse } from "next/server";

import {
  buildPinFailureMessage,
  createSessionToken,
  getPinRateLimitStatus,
  getSessionCookieName,
  getSessionMaxAgeSeconds,
  registerPinAttempt,
  verifyPin,
} from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { pin?: string } | null;
  const pin = body?.pin?.trim() ?? "";
  const rateLimitStatus = await getPinRateLimitStatus("dashboard", request);

  if (rateLimitStatus.isBlocked) {
    return NextResponse.json(
      { ok: false, error: buildPinFailureMessage("PIN", rateLimitStatus) },
      { status: 429 },
    );
  }

  if (!verifyPin(pin)) {
    const failureStatus = await registerPinAttempt("dashboard", request, false);

    return NextResponse.json(
      { ok: false, error: buildPinFailureMessage("PIN", failureStatus) },
      { status: failureStatus.isBlocked ? 429 : 401 },
    );
  }

  await registerPinAttempt("dashboard", request, true);

  const token = createSessionToken();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Auth is not configured on the server." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set({
    name: getSessionCookieName(),
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getSessionMaxAgeSeconds(),
  });

  return response;
}
