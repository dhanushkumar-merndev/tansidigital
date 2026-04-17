import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "dashboard_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function getDashboardPassword() {
  return process.env.DASHBOARD_PASSWORD?.trim() ?? "";
}

function getDigitalPin() {
  return process.env.DIGITAL_PIN?.trim() ?? "";
}

function getAuthSalt() {
  return process.env.AUTH_SALT?.trim() ?? "";
}

function toBuffer(value: string) {
  return Buffer.from(value, "utf8");
}

function getSessionSecret() {
  const authSalt = getAuthSalt();
  const dashboardPassword = getDashboardPassword();

  if (!authSalt || !dashboardPassword) {
    return "";
  }

  return `${authSalt}:${dashboardPassword}`;
}

function signSessionPayload(payload: string) {
  const secret = getSessionSecret();
  if (!secret) return "";

  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function createSessionToken() {
  const secret = getSessionSecret();
  if (!secret) {
    return "";
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  const payload = `${nonce}.${issuedAt}`;
  const signature = signSessionPayload(payload);

  return `${payload}.${signature}`;
}

export function verifyPin(pin: string) {
  const configuredPassword = getDashboardPassword();
  if (!configuredPassword) {
    return false;
  }

  const expected = toBuffer(configuredPassword);
  const candidate = toBuffer(pin);

  if (expected.length !== candidate.length) {
    return false;
  }

  return timingSafeEqual(expected, candidate);
}

export function verifyDigitalPin(pin: string) {
  const configuredPin = getDigitalPin();
  if (!configuredPin) {
    return false;
  }

  const expected = toBuffer(configuredPin);
  const candidate = toBuffer(pin);

  if (expected.length !== candidate.length) {
    return false;
  }

  return timingSafeEqual(expected, candidate);
}

export async function isAuthenticated() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;

  if (!session) {
    return false;
  }

  const [nonce, issuedAtRaw, signature] = session.split(".");
  if (!nonce || !issuedAtRaw || !signature) {
    return false;
  }

  const issuedAt = Number.parseInt(issuedAtRaw, 10);
  if (!Number.isFinite(issuedAt)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (now - issuedAt > SESSION_MAX_AGE_SECONDS) {
    return false;
  }

  const expectedSignature = signSessionPayload(`${nonce}.${issuedAtRaw}`);
  if (!expectedSignature) {
    return false;
  }

  const expected = toBuffer(expectedSignature);
  const candidate = toBuffer(signature);

  if (expected.length !== candidate.length) {
    return false;
  }

  return timingSafeEqual(expected, candidate);
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export function getSessionMaxAgeSeconds() {
  return SESSION_MAX_AGE_SECONDS;
}
