import { cookies } from "next/headers";
import { promises as fs } from "fs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import path from "path";

const SESSION_COOKIE = "dashboard_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const PIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const PIN_RATE_LIMIT_BLOCK_MS = 24 * 60 * 60 * 1000;
const PIN_RATE_LIMIT_SOURCE_PATH = path.join(process.cwd(), "data", "pin-rate-limits.json");
const IS_CLOUD_ENVIRONMENT =
  process.env.NODE_ENV === "production" || !!process.env.VERCEL || !!process.env.AWS_REGION;
const PIN_RATE_LIMIT_RUNTIME_PATH = (() => {
  const configuredPath = process.env.PIN_RATE_LIMIT_PATH?.trim();
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(process.cwd(), configuredPath);
  }

  if (IS_CLOUD_ENVIRONMENT) {
    return path.join("/tmp", "pin-rate-limits.json");
  }

  return PIN_RATE_LIMIT_SOURCE_PATH;
})();

type PinAttemptScope = "dashboard" | "digital";

type PinRateLimitEntry = {
  blockedUntil: number | null;
  failedAttempts: number;
  updatedAt: number;
};

type PinRateLimitStore = Record<string, PinRateLimitEntry>;

export type PinRateLimitStatus = {
  blockedUntil: string | null;
  isBlocked: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
};

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

function getPinRateLimitKey(scope: PinAttemptScope, request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const clientIdentifier = forwardedFor || realIp || "local";

  return `${scope}:${clientIdentifier}`;
}

function createPinRateLimitStatus(entry: PinRateLimitEntry | undefined, now = Date.now()): PinRateLimitStatus {
  if (entry?.blockedUntil && entry.blockedUntil > now) {
    return {
      blockedUntil: new Date(entry.blockedUntil).toISOString(),
      isBlocked: true,
      remainingAttempts: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000)),
    };
  }

  const failedAttempts = entry?.failedAttempts ?? 0;

  return {
    blockedUntil: null,
    isBlocked: false,
    remainingAttempts: Math.max(0, PIN_RATE_LIMIT_MAX_ATTEMPTS - failedAttempts),
    retryAfterSeconds: 0,
  };
}

function formatBlockedUntil(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  }).format(date);
}

async function ensurePinRateLimitDirectory() {
  await fs.mkdir(path.dirname(PIN_RATE_LIMIT_RUNTIME_PATH), { recursive: true });
}

async function readPinRateLimitStore(): Promise<PinRateLimitStore> {
  try {
    const contents = await fs.readFile(PIN_RATE_LIMIT_RUNTIME_PATH, "utf8");
    const parsed = JSON.parse(contents) as PinRateLimitStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return {};
    }

    console.error("Unable to read PIN rate-limit store:", error);
    return {};
  }
}

async function writePinRateLimitStore(store: PinRateLimitStore) {
  try {
    await ensurePinRateLimitDirectory();
    await fs.writeFile(PIN_RATE_LIMIT_RUNTIME_PATH, JSON.stringify(store), "utf8");
  } catch (error) {
    console.error("Unable to write PIN rate-limit store:", error);
  }
}

export async function getPinRateLimitStatus(
  scope: PinAttemptScope,
  request: Request,
): Promise<PinRateLimitStatus> {
  const key = getPinRateLimitKey(scope, request);
  const store = await readPinRateLimitStore();
  const now = Date.now();
  const entry = store[key];

  if (entry?.blockedUntil && entry.blockedUntil <= now) {
    delete store[key];
    await writePinRateLimitStore(store);
    return createPinRateLimitStatus(undefined, now);
  }

  return createPinRateLimitStatus(entry, now);
}

export async function registerPinAttempt(
  scope: PinAttemptScope,
  request: Request,
  success: boolean,
): Promise<PinRateLimitStatus> {
  const key = getPinRateLimitKey(scope, request);
  const store = await readPinRateLimitStore();
  const now = Date.now();
  const currentEntry = store[key];

  if (currentEntry?.blockedUntil && currentEntry.blockedUntil <= now) {
    delete store[key];
  }

  if (success) {
    if (store[key]) {
      delete store[key];
      await writePinRateLimitStore(store);
    }

    return createPinRateLimitStatus(undefined, now);
  }

  const activeEntry = store[key];
  if (activeEntry?.blockedUntil && activeEntry.blockedUntil > now) {
    return createPinRateLimitStatus(activeEntry, now);
  }

  const failedAttempts = (activeEntry?.failedAttempts ?? 0) + 1;
  const blockedUntil =
    failedAttempts >= PIN_RATE_LIMIT_MAX_ATTEMPTS ? now + PIN_RATE_LIMIT_BLOCK_MS : null;
  const nextEntry: PinRateLimitEntry = {
    blockedUntil,
    failedAttempts,
    updatedAt: now,
  };

  store[key] = nextEntry;
  await writePinRateLimitStore(store);

  return createPinRateLimitStatus(nextEntry, now);
}

export function buildPinFailureMessage(label: string, status: PinRateLimitStatus) {
  if (status.isBlocked) {
    const blockedUntil = formatBlockedUntil(status.blockedUntil);
    return blockedUntil
      ? `Too many wrong ${label} attempts. Try again after ${blockedUntil}.`
      : `Too many wrong ${label} attempts. Try again in 24 hours.`;
  }

  return `${label} is incorrect. ${status.remainingAttempts} attempt${
    status.remainingAttempts === 1 ? "" : "s"
  } left before a 24-hour block.`;
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
