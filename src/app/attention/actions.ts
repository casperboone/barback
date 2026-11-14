"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attentionAcknowledgements } from "@/db/schema";

function failure(error: unknown, fallback: string) {
  return {
    ok: false as const,
    error: error instanceof Error ? error.message : fallback,
  };
}

// Keys and fingerprints are made by the attention queries; anything else
// can't be one.
function valid(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 2000;
}

// Known about, and left as it is: hidden until its state changes.
export async function acknowledge(key: string, fingerprint: string) {
  if (!valid(key) || !valid(fingerprint)) {
    return { ok: false as const, error: "Nothing to acknowledge." };
  }
  try {
    const acknowledgedAt = new Date();
    await db
      .insert(attentionAcknowledgements)
      .values({ key, fingerprint, acknowledgedAt })
      .onConflictDoUpdate({
        target: attentionAcknowledgements.key,
        set: { fingerprint, acknowledgedAt },
      });
    revalidatePath("/attention");
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not acknowledge it.");
  }
}

export async function unacknowledge(key: string) {
  if (!valid(key)) return { ok: false as const, error: "Nothing to undo." };
  try {
    await db
      .delete(attentionAcknowledgements)
      .where(eq(attentionAcknowledgements.key, key));
    revalidatePath("/attention");
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not show it again.");
  }
}
