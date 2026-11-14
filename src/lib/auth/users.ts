import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { OWNER_EMAIL } from "./config";
import { normalizeEmail } from "./rules";

// Called after Google vouched for an account. Links it to someone who was added
// by email beforehand, or records it as an access request when it's new.
// Either way the name and photo follow Google's.
export async function recordSignIn(profile: {
  googleId: string;
  email: string;
  name: string | null;
  image: string | null;
}): Promise<User> {
  const email = normalizeEmail(profile.email);
  const now = new Date();

  const [byGoogleId] = await db
    .select()
    .from(users)
    .where(eq(users.googleId, profile.googleId));
  const [existing] = byGoogleId
    ? [byGoogleId]
    : await db.select().from(users).where(eq(users.email, email));

  const isOwner = (existing?.email ?? email) === OWNER_EMAIL;

  if (!existing) {
    const [created] = await db
      .insert(users)
      .values({
        email,
        googleId: profile.googleId,
        name: profile.name,
        image: profile.image,
        status: isOwner ? "approved" : "requested",
        approvedAt: isOwner ? now : null,
        lastSignInAt: now,
      })
      .returning();
    return created;
  }

  const [updated] = await db
    .update(users)
    .set({
      googleId: profile.googleId,
      name: profile.name,
      image: profile.image,
      lastSignInAt: now,
      ...(isOwner && existing.status !== "approved"
        ? { status: "approved" as const, approvedAt: now }
        : {}),
    })
    .where(eq(users.id, existing.id))
    .returning();
  return updated;
}

// Requests first, newest on top; then everyone with access by name.
export async function listUsers() {
  return db
    .select()
    .from(users)
    .orderBy(
      desc(sql`${users.status} = 'requested'`),
      desc(sql`case when ${users.status} = 'requested' then ${users.createdAt} end`),
      asc(sql`coalesce(${users.name}, ${users.email}) collate nocase`),
    );
}

export async function countAccessRequests() {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.status, "requested"));
  return row?.count ?? 0;
}
