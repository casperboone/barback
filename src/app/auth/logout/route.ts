import { NextResponse, type NextRequest } from "next/server";
import { deleteSession, SESSION_COOKIE } from "@/lib/auth/session";

// Logs out of BarBack only: My DWH has no way for apps to end its own login,
// so the logged-out page offers to log in as someone else.
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);

  const response = NextResponse.redirect(
    new URL("/auth/logged-out", request.nextUrl.origin),
    303,
  );
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
