import { NextResponse, type NextRequest } from "next/server";
import * as client from "openid-client";
import { describeError, oidcConfig, redirectUri } from "@/lib/auth/config";
import { decodeFlow, FLOW_COOKIE, flowCookieOptions } from "@/lib/auth/flow";
import {
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { logger } from "@/lib/logger";

// Where My DWH sends the member back, with a code to exchange for tokens or
// with an error.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const flow = decodeFlow(request.cookies.get(FLOW_COOKIE)?.value);
  if (!flow) return finish(origin, "/auth/error?reason=expired");

  // The callback URL as registered, with this request's query string, so it
  // matches even when a proxy in front rewrote the host.
  const currentUrl = new URL(redirectUri(origin));
  currentUrl.search = request.nextUrl.search;

  let tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>;
  try {
    tokens = await client.authorizationCodeGrant(await oidcConfig(), currentUrl, {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      idTokenExpected: true,
    });
  } catch (error) {
    if (
      error instanceof client.AuthorizationResponseError &&
      error.error === "access_denied"
    ) {
      return finish(origin, "/auth/denied");
    }
    logger.error(`Logging in with My DWH failed: ${describeError(error)}`);
    return finish(origin, "/auth/error?reason=failed");
  }

  const claims = tokens.claims();
  if (!claims?.sub) return finish(origin, "/auth/error?reason=failed");

  const { token, expiresAt } = await createSession({
    sub: claims.sub,
    name: typeof claims.name === "string" ? claims.name : null,
    refreshToken: tokens.refresh_token ?? null,
  });

  const response = finish(origin, flow.next);
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return response;
}

function finish(origin: string, path: string) {
  const response = NextResponse.redirect(new URL(path, origin));
  response.cookies.set(FLOW_COOKIE, "", { ...flowCookieOptions, maxAge: 0 });
  return response;
}
