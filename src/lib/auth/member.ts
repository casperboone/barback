import { headers } from "next/headers";

// The proxy has already looked the session up, so it hands the member on to
// pages in a request header instead of every page looking it up again. Any
// copy of this header sent by a browser is removed first.
export const MEMBER_HEADER = "x-barback-member";

export type Member = { name: string | null };

export function encodeMember(member: Member) {
  return encodeURIComponent(JSON.stringify(member));
}

// The logged-in member for the current request, or null in open local
// development and on the logged-out pages.
export async function getCurrentMember(): Promise<Member | null> {
  const value = (await headers()).get(MEMBER_HEADER);
  if (!value) return null;
  try {
    return JSON.parse(decodeURIComponent(value)) as Member;
  } catch {
    return null;
  }
}
