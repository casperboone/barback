import { generateCodeVerifier, generateState } from "arctic";
import { NextResponse, type NextRequest } from "next/server";
import { googleClient, OAUTH_COOKIES } from "@/lib/auth/config";
import { safeNextPath } from "@/lib/auth/rules";

// Sends the visitor to Google's sign-in, remembering (for ten minutes) what
// the callback needs to check that it's the same sign-in coming back.
export function GET(request: NextRequest) {
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = googleClient(request.nextUrl.origin).createAuthorizationURL(
    state,
    verifier,
    ["openid", "profile", "email"],
  );
  // The bar's account and a personal one are often both signed in.
  url.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(url);
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 10 * 60,
  };
  response.cookies.set(OAUTH_COOKIES.state, state, options);
  response.cookies.set(OAUTH_COOKIES.verifier, verifier, options);
  response.cookies.set(
    OAUTH_COOKIES.next,
    safeNextPath(request.nextUrl.searchParams.get("next")),
    options,
  );
  return response;
}
