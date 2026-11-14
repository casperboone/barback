import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authMode } from "@/lib/auth/config";
import {
  extendSession,
  SESSION_COOKIE,
  sessionCookieOptions,
  validateSessionToken,
} from "@/lib/auth/session";

// The sign-in pages themselves, the only ones open to everyone.
const PUBLIC_PATHS = ["/login", "/auth/google", "/auth/google/callback"];

// Every page, API route and server action passes through here, so this is the
// one place that checks the session against the database. Images are cached
// by the browser, so that's one lookup per page, not per thumbnail.
export async function proxy(request: NextRequest) {
  const mode = authMode();
  if (mode === "open") return NextResponse.next();
  if (mode === "misconfigured") {
    return new NextResponse(
      "Sign-in isn't set up: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      { status: 503 },
    );
  }

  if (PUBLIC_PATHS.includes(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const found = token ? await validateSessionToken(token) : null;
  if (!token || !found) return turnAway(request);

  const response = NextResponse.next();
  const expiresAt = await extendSession(found.session);
  if (expiresAt) {
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  }
  return response;
}

// Someone opening a page goes to the login page and comes back afterwards;
// anything else (a server action, an image, a PDF) just gets refused.
function turnAway(request: NextRequest) {
  const isPage =
    request.method === "GET" &&
    !request.headers.has("next-action") &&
    request.headers.get("accept")?.includes("text/html");

  const response = isPage
    ? NextResponse.redirect(loginUrl(request))
    : new NextResponse("Sign in to continue.", { status: 401 });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

function loginUrl(request: NextRequest) {
  const url = new URL("/login", request.nextUrl.origin);
  const { pathname, search } = request.nextUrl;
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return url;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
