"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { OWNER_EMAIL } from "@/lib/auth/config";
import { isPlausibleEmail, normalizeEmail } from "@/lib/auth/rules";
import { requireUser } from "@/lib/auth/session";

export type UserActionResult = { ok: true } | { ok: false; error: string };

// Gives an address access before its owner ever signs in, so their first visit
// just works. Someone who already asked is let in instead.
export async function addUser(input: string): Promise<UserActionResult> {
  await requireUser();
  const email = normalizeEmail(input);
  if (!isPlausibleEmail(email)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing?.status === "approved") {
    return { ok: false, error: `${email} already has access.` };
  }
  if (existing) {
    await db
      .update(users)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(users.id, existing.id));
  } else {
    await db
      .insert(users)
      .values({ email, status: "approved", approvedAt: new Date() });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function approveUser(id: number): Promise<UserActionResult> {
  await requireUser();
  await db
    .update(users)
    .set({ status: "approved", approvedAt: new Date() })
    .where(eq(users.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

// Takes away access (or turns down a request) and signs them out everywhere.
// Signing in again later shows up as a new request.
export async function removeUser(id: number): Promise<UserActionResult> {
  const me = await requireUser();
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) return { ok: true };
  if (user.email === OWNER_EMAIL) {
    return { ok: false, error: `${OWNER_EMAIL} always has access.` };
  }
  if (user.id === me?.id) {
    return { ok: false, error: "You can't remove yourself." };
  }

  await db.delete(sessions).where(eq(sessions.userId, id));
  await db.delete(users).where(eq(users.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}
