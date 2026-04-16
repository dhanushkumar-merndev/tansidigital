import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "dashboard_session";

function getDashboardPassword() {
  return process.env.DASHBOARD_PASSWORD ?? "";
}

function getAuthSalt() {
  return process.env.AUTH_SALT ?? "dashboard-fallback-salt";
}

function toBuffer(value: string) {
  return Buffer.from(value, "utf8");
}

export function createSessionToken() {
  return createHash("sha256")
    .update(`${getAuthSalt()}:${getDashboardPassword()}`)
    .digest("hex");
}

export function verifyPin(pin: string) {
  const expected = toBuffer(getDashboardPassword());
  const candidate = toBuffer(pin);

  if (expected.length !== candidate.length) {
    return false;
  }

  return timingSafeEqual(expected, candidate);
}

export async function isAuthenticated() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;

  return session === createSessionToken();
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}
