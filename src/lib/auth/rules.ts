// The parts of signing in that need no database, kept apart for the tests.

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

// Loose on purpose: Google decides what an address is, this only catches typos
// like a missing @ when adding someone by hand.
export function isPlausibleEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Where to land after signing in. Only a path on this site, so a crafted login
// link can't send someone elsewhere ("//evil.com" and "/\evil.com" are hosts to
// a browser).
export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

export const SESSION_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

// Sessions slide: a visit in the second half of their life starts a fresh 30
// days, so someone who uses the app weekly never has to sign in again.
export function extendedExpiry(expiresAt: Date, now = new Date()) {
  if (expiresAt.getTime() - now.getTime() > (SESSION_DAYS / 2) * DAY) {
    return null;
  }
  return new Date(now.getTime() + SESSION_DAYS * DAY);
}

export function newExpiry(now = new Date()) {
  return new Date(now.getTime() + SESSION_DAYS * DAY);
}
