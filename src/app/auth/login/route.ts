import { NextResponse, type NextRequest } from "next/server";
import * as client from "openid-client";
import { authMode, oidcConfig, redirectUri, SCOPES } from "@/lib/auth/config";
import { encodeFlow, FLOW_COOKIE, flowCookieOptions } from "@/lib/auth/flow";
import { safeNextPath } from "@/lib/auth/rules";
import { logger } from "@/lib/logger";

// Sends the member to My DWH. When they are already logged in there, they're
// back before they notice. `?prompt=login` makes them log in again, to switch
// accounts.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"));
  const origin = request.nextUrl.origin;
  if (authMode() !== "on") return NextResponse.redirect(new URL(next, origin));

  let config: client.Configuration;
  try {
    config = await oidcConfig();
  } catch (error) {
    logger.error(`My DWH discovery failed: ${String(error)}`);
    return NextResponse.redirect(new URL("/auth/error?reason=unreachable", origin));
  }

  const state = client.randomState();
  const nonce = client.randomNonce();
  const verifier = client.randomPKCECodeVerifier();
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri(origin),
    scope: SCOPES,
    state,
    nonce,
    code_challenge: await client.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
    ...(params.get("prompt") === "login" ? { prompt: "login" } : {}),
  });

  const response = NextResponse.redirect(url);
  response.cookies.set(
    FLOW_COOKIE,
    encodeFlow({ state, nonce, verifier, next }),
    flowCookieOptions,
  );
  return response;
}
