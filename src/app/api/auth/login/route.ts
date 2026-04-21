import { NextResponse } from "next/server";

import {
  buildPinFailureMessage,
  getBrowserAccessCookieName,
  getBrowserAccessMaxAgeSeconds,
  createSessionToken,
  getPinRateLimitStatus,
  getSessionCookieName,
  getSessionMaxAgeSeconds,
  registerPinAttempt,
  verifyPin,
} from "@/lib/auth";
import { registerBrowserAccess } from "@/lib/sheets";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { browserId?: string; name?: string; pin?: string }
    | null;
  const pin = body?.pin?.trim() ?? "";
  const browserId = body?.browserId?.trim() ?? "";
  const name = body?.name?.trim() ?? "";
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

  if (!browserId) {
    return NextResponse.json(
      { ok: false, error: "Browser access id is required." },
      { status: 400 },
    );
  }

  if (!name) {
    return NextResponse.json(
      { ok: false, error: "Your name is required for first-time access." },
      { status: 400 },
    );
  }

  const accessDecision = await registerBrowserAccess(browserId, name);
  const token = createSessionToken();
  const baseCookie = {
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };

  if (accessDecision.state !== "allowed") {
    const response = NextResponse.json(
      {
        ok: false,
        state: accessDecision.state,
        error:
          accessDecision.state === "pending"
            ? "Access for this browser is pending approval."
            : "Access for this browser has been blocked.",
      },
      { status: 403 },
    );

    if (accessDecision.state === "pending" && token) {
      response.cookies.set({
        name: getSessionCookieName(),
        value: token,
        httpOnly: true,
        maxAge: getSessionMaxAgeSeconds(),
        ...baseCookie,
      });
    }

    response.cookies.set({
      name: getBrowserAccessCookieName(),
      value: browserId,
      httpOnly: true,
      maxAge: getBrowserAccessMaxAgeSeconds(),
      ...baseCookie,
    });

    return response;
  }

  if (!token) {
    return NextResponse.json({ ok: false, error: "Auth is not configured on the server." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set({
    name: getSessionCookieName(),
    value: token,
    httpOnly: true,
    maxAge: getSessionMaxAgeSeconds(),
    ...baseCookie,
  });

  response.cookies.set({
    name: getBrowserAccessCookieName(),
    value: browserId,
    httpOnly: true,
    maxAge: getBrowserAccessMaxAgeSeconds(),
    ...baseCookie,
  });

  return response;
}
