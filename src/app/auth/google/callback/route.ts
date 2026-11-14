import { decodeIdToken } from "arctic";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { googleClient, OAUTH_COOKIES } from "@/lib/auth/config";
import { safeNextPath } from "@/lib/auth/rules";
import {
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { recordSignIn } from "@/lib/auth/users";
import { logger } from "@/lib/logger";

// The ID token comes straight from Google over TLS in exchange for the code,
// so its claims can be read without checking the signature.
const claimsSchema = z.object({
  sub: z.string(),
  email: z.string(),
  email_verified: z.boolean(),
  name: z.string().optional(),
  picture: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = request.cookies.get(OAUTH_COOKIES.state)?.value;
  const verifier = request.cookies.get(OAUTH_COOKIES.verifier)?.value;
  const next = safeNextPath(request.cookies.get(OAUTH_COOKIES.next)?.value);

  const finish = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin));
    for (const name of Object.values(OAUTH_COOKIES)) {
      response.cookies.delete(name);
    }
    return response;
  };

  // Cancelled at Google's account chooser.
  if (searchParams.get("error")) return finish("/login");
  if (!code || !state || !storedState || !verifier || state !== storedState) {
    return finish("/login?error=expired");
  }

  let claims: z.infer<typeof claimsSchema>;
  try {
    const tokens = await googleClient(origin).validateAuthorizationCode(
      code,
      verifier,
    );
    claims = claimsSchema.parse(decodeIdToken(tokens.idToken()));
  } catch (error) {
    logger.error(
      `Google sign-in failed: ${error instanceof Error ? error.message : error}`,
    );
    return finish("/login?error=failed");
  }
  if (!claims.email_verified) return finish("/login?error=unverified");

  const user = await recordSignIn({
    googleId: claims.sub,
    email: claims.email,
    name: claims.name ?? null,
    image: claims.picture ?? null,
  });
  if (user.status !== "approved") {
    logger.info(`Access requested by ${user.email}`);
    return finish("/login?status=requested");
  }

  const { token, expiresAt } = await createSession(user.id);
  const response = finish(next);
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return response;
}
