import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { authMode } from "./config";
import { extendedExpiry, newExpiry } from "./rules";

export const SESSION_COOKIE = "session";

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = newExpiry();
  await db.insert(sessions).values({ id: hash(token), userId, expiresAt });
  return { token, expiresAt };
}

// The session behind a cookie and who it belongs to, or null when it expired,
// was signed out, or its user no longer has access.
export async function validateSessionToken(token: string) {
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, hash(token)));
  if (!row) return null;

  if (row.session.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id));
    return null;
  }
  if (row.user.status !== "approved") return null;
  return row;
}

// Moves the expiry forward when it's due; returns the new one so the cookie
// can follow, or null when nothing changed.
export async function extendSession(session: { id: string; expiresAt: Date }) {
  const expiresAt = extendedExpiry(session.expiresAt);
  if (!expiresAt) return null;
  await db
    .update(sessions)
    .set({ expiresAt })
    .where(eq(sessions.id, session.id));
  return expiresAt;
}

export async function invalidateSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, hash(token)));
}

// The signed-in user for the current request, or null. The proxy has already
// turned away anyone without a valid session, so pages can rely on this.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return (await validateSessionToken(token))?.user ?? null;
});

// For server actions that change who has access: they check for themselves
// instead of relying on the proxy alone. Returns null in open local
// development, where nobody is signed in.
export async function requireUser() {
  if (authMode() === "open") return null;
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in again to continue.");
  return user;
}
