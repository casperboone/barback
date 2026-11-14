"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { invalidateSession, SESSION_COOKIE } from "@/lib/auth/session";

export async function signOut() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSession(token);
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
