import { NextResponse } from "next/server";

import { createSessionToken, getSessionCookieName, verifyPin } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { pin?: string } | null;
  const pin = body?.pin?.trim() ?? "";

  if (!verifyPin(pin)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set({
    name: getSessionCookieName(),
    value: createSessionToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}
