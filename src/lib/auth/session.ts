import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import * as client from "openid-client";
import { db } from "@/db";
import { sessions, type Session } from "@/db/schema";
import { logger } from "@/lib/logger";
import { oidcConfig } from "./config";
import { isDueForCheck, newExpiry, staleLockBefore } from "./rules";

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

export async function createSession(member: {
  sub: string;
  name: string | null;
  refreshToken: string | null;
}) {
  const now = new Date();
  // A good moment to clear out logins nobody came back to.
  await db.delete(sessions).where(lt(sessions.expiresAt, now));

  const token = randomBytes(32).toString("base64url");
  const expiresAt = newExpiry(now);
  await db.insert(sessions).values({
    id: hash(token),
    sub: member.sub,
    name: member.name,
    refreshToken: member.refreshToken,
    checkedAt: now,
    expiresAt,
  });
  return { token, expiresAt };
}

// The session behind a cookie, or null when it expired or was logged out.
export async function findSession(token: string) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, hash(token)));
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }
  return session;
}

export async function deleteSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, hash(token)));
}

// What asking My DWH about a session came to:
// - "confirmed": still an active member; the session runs 30 more days.
// - "ended": the membership ended, the member was deleted or the app was
//   revoked. The session is gone and the member has to log in again.
// - "skipped": not due, another request is already asking, or My DWH could
//   not be reached. The session stays as it is and a later request asks again.
export type CheckResult =
  | { status: "confirmed"; expiresAt: Date }
  | { status: "ended" }
  | { status: "skipped" };

// Every 15 minutes a request spends the refresh token to confirm the member
// may still log in, the same check My DWH makes whenever it issues a token.
export async function checkSession(session: Session): Promise<CheckResult> {
  if (!session.refreshToken || !isDueForCheck(session.checkedAt)) {
    return { status: "skipped" };
  }

  // Refresh tokens work once. Pages fire several requests at the same time,
  // so only the one that claims the session refreshes; the rest go ahead.
  const now = new Date();
  const [claimed] = await db
    .update(sessions)
    .set({ refreshingAt: now })
    .where(
      and(
        eq(sessions.id, session.id),
        eq(sessions.refreshToken, session.refreshToken),
        or(
          isNull(sessions.refreshingAt),
          lt(sessions.refreshingAt, staleLockBefore(now)),
        ),
      ),
    )
    .returning({ refreshToken: sessions.refreshToken });
  if (!claimed?.refreshToken) return { status: "skipped" };

  let tokens: Awaited<ReturnType<typeof client.refreshTokenGrant>>;
  try {
    tokens = await client.refreshTokenGrant(
      await oidcConfig(),
      claimed.refreshToken,
    );
  } catch (error) {
    if (error instanceof client.ResponseBodyError && error.error === "invalid_grant") {
      await db.delete(sessions).where(eq(sessions.id, session.id));
      return { status: "ended" };
    }
    // My DWH being down shouldn't lock everyone out. The claim stays, so the
    // next attempt waits a little instead of every request trying at once.
    logger.warn(`Couldn't check a session with My DWH: ${String(error)}`);
    return { status: "skipped" };
  }

  const expiresAt = newExpiry();
  const claims = tokens.claims();
  await db
    .update(sessions)
    .set({
      refreshToken: tokens.refresh_token ?? claimed.refreshToken,
      name: typeof claims?.name === "string" ? claims.name : session.name,
      checkedAt: new Date(),
      refreshingAt: null,
      expiresAt,
    })
    .where(eq(sessions.id, session.id));
  return { status: "confirmed", expiresAt };
}
