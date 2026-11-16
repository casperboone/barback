import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authMode } from "@/lib/auth/config";
import { encodeMember, MEMBER_HEADER } from "@/lib/auth/member";
import {
  checkSession,
  findSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";

// Every page, API route and server action passes through here, so this is the
// one place that checks the login. Logging in itself happens under /auth,
// the only part open to everyone.
export async function proxy(request: NextRequest) {
  const forwarded = new Headers(request.headers);
  forwarded.delete(MEMBER_HEADER);

  const mode = authMode();
  if (mode === "open") return next(forwarded);
  if (mode === "misconfigured") {
    return new NextResponse(
      "Logging in isn't set up: set MY_DWH_CLIENT_ID and MY_DWH_CLIENT_SECRET.",
      { status: 503 },
    );
  }

  const { pathname } = request.nextUrl;
  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    return next(forwarded);
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await findSession(token) : null;
  if (!token || !session) return turnAway(request);

  const check = await checkSession(session);
  if (check.status === "ended") return turnAway(request);

  forwarded.set(MEMBER_HEADER, encodeMember({ name: session.name }));
  const response = next(forwarded);
  if (check.status === "confirmed") {
    response.cookies.set(
      SESSION_COOKIE,
      token,
      sessionCookieOptions(check.expiresAt),
    );
  }
  return response;
}

function next(headers: Headers) {
  return NextResponse.next({ request: { headers } });
}

// Someone opening a page goes to My DWH and comes back afterwards; anything
// else (a server action, an image, a PDF) just gets refused.
function turnAway(request: NextRequest) {
  const isPage =
    request.method === "GET" &&
    !request.headers.has("next-action") &&
    request.headers.get("accept")?.includes("text/html");

  const response = isPage
    ? NextResponse.redirect(loginUrl(request))
    : new NextResponse("Log in to continue.", { status: 401 });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

function loginUrl(request: NextRequest) {
  const url = new URL("/auth/login", request.nextUrl.origin);
  const { pathname, search } = request.nextUrl;
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return url;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
