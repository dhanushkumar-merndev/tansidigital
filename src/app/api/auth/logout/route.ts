import { NextResponse } from "next/server";

import { getBrowserAccessCookieName, getSessionCookieName } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: getSessionCookieName(),
    value: "",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set({
    name: getBrowserAccessCookieName(),
    value: "",
    path: "/",
    maxAge: 0,
  });
  return response;
}
