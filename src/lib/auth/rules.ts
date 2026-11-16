// The parts of logging in that need no database or network, kept apart for the
// tests.

// Where to land after logging in. Only a path on this site, so a crafted login
// link can't send someone elsewhere ("//evil.com" and "/\evil.com" are hosts to
// a browser).
export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// My DWH refresh tokens last 30 days and each refresh gives a new one, so a
// session lasts as long as the member keeps using the app at least monthly.
export const SESSION_DAYS = 30;

// How often to ask My DWH whether the member still has an active membership:
// as often as its access tokens expire.
export const CHECK_MINUTES = 15;

// A refresh that started this long ago and never finished (a crashed request)
// no longer blocks the next one.
export const REFRESH_LOCK_SECONDS = 30;

export function newExpiry(now = new Date()) {
  return new Date(now.getTime() + SESSION_DAYS * DAY);
}

export function isDueForCheck(checkedAt: Date, now = new Date()) {
  return now.getTime() - checkedAt.getTime() >= CHECK_MINUTES * MINUTE;
}

export function staleLockBefore(now = new Date()) {
  return new Date(now.getTime() - REFRESH_LOCK_SECONDS * 1000);
}
