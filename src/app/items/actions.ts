"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  assortmentCategories,
  assortmentItems,
  compositeComponents,
  orderLines,
  orders,
} from "@/db/schema";
import { getItemDialogData } from "@/lib/items/queries";
import { revalidateItemScreens } from "@/lib/items/revalidate";
import { nextCategoryPosition, nextItemPosition } from "@/lib/positions";

function failure(error: unknown, fallback: string) {
  return {
    ok: false as const,
    error: error instanceof Error ? error.message : fallback,
  };
}

// Per item, so a screen that opens the dialog doesn't need all of pricing to do
// so. Leave out the id for what a new item needs.
export async function loadItemDialog(
  itemId?: number,
  options?: { composite?: boolean }
) {
  try {
    const data = await getItemDialogData(itemId, options);
    if (itemId != null && !data.item) {
      return { ok: false as const, error: "Item not found." };
    }
    return { ok: true as const, data };
  } catch (error) {
    return failure(error, "Could not load the item.");
  }
}

const optionalNumber = z.number().min(0).nullable();
const fraction = z.number().min(0).max(1).nullable();

const itemSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "A name is required."),
  categoryId: z.number().int().positive().optional(),
  newCategoryName: z.string().trim().min(1).optional(),
  target: optionalNumber,
  supplierProductId: z.number().int().positive().nullable(),
  note: z.string().trim().max(500).nullable(),
  special: z.boolean(),
  pricingCategoryId: z.number().int().positive().nullable(),
  notForSale: z.boolean(),
  unitVolume: optionalNumber,
  portionVolume: optionalNumber,
  portionsPerUnit: optionalNumber,
  alcoholPercentage: fraction,
  vatRate: fraction,
  manualPurchasePrice: optionalNumber,
  purchaseSource: z.string().trim().max(200).nullable(),
});

export type ItemInput = z.input<typeof itemSchema>;

export async function saveItem(input: ItemInput) {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: z.prettifyError(parsed.error) };
  }
  const { id, newCategoryName, ...fields } = parsed.data;
  const values = {
    ...fields,
    // Zero portions would only ever divide by zero.
    unitVolume: fields.unitVolume || null,
    portionVolume: fields.portionVolume || null,
    portionsPerUnit: fields.portionsPerUnit || null,
    purchaseSource: fields.purchaseSource || null,
  };

  try {
    const categoryId = await resolveCategory(fields.categoryId, newCategoryName);
    if (!categoryId) {
      return { ok: false as const, error: "Choose a category." };
    }

    if (id) {
      await db
        .update(assortmentItems)
        .set({ ...values, categoryId, updatedAt: new Date() })
        .where(
          and(eq(assortmentItems.id, id), eq(assortmentItems.kind, "product"))
        );
    } else {
      await db.insert(assortmentItems).values({
        ...values,
        categoryId,
        position: await nextItemPosition(categoryId),
      });
    }

    revalidateItemScreens();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not save the item.");
  }
}

// The chosen category, or the one typed in, which is created when it's new.
async function resolveCategory(
  categoryId: number | undefined,
  newCategoryName: string | undefined
) {
  if (!newCategoryName) return categoryId;
  const existing = await db.query.assortmentCategories.findFirst({
    where: eq(assortmentCategories.name, newCategoryName),
    columns: { id: true },
  });
  if (existing) return existing.id;
  const [created] = await db
    .insert(assortmentCategories)
    .values({
      name: newCategoryName,
      position: await nextCategoryPosition(assortmentCategories),
    })
    .returning({ id: assortmentCategories.id });
  return created.id;
}

const compositeSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "A name is required."),
  categoryId: z.number().int().positive().optional(),
  newCategoryName: z.string().trim().min(1).optional(),
  note: z.string().trim().max(500).nullable(),
  special: z.boolean(),
  components: z
    .array(
      z.object({
        componentId: z.number().int().positive(),
        quantity: z.number().positive("A quantity must be above zero."),
      })
    )
    .refine(
      (components) =>
        new Set(components.map((c) => c.componentId)).size ===
        components.length,
      "An item can only go in once; raise its quantity instead."
    ),
});

export type CompositeInput = z.input<typeof compositeSchema>;

// A composite and what goes into it. Components that stay keep the price
// they had when the composite's price was set, so the pricing screen can tell
// what moved; a new one starts without, which shows as a moved sum.
export async function saveComposite(input: CompositeInput) {
  const parsed = compositeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: z.prettifyError(parsed.error) };
  }
  const { id, newCategoryName, components, ...fields } = parsed.data;

  try {
    if (id) {
      const existing = await db.query.assortmentItems.findFirst({
        where: and(
          eq(assortmentItems.id, id),
          eq(assortmentItems.kind, "composite")
        ),
        columns: { id: true },
      });
      if (!existing) return { ok: false as const, error: "Item not found." };
    }

    const ids = components.map((component) => component.componentId);
    const found =
      ids.length > 0
        ? await db
            .select({
              id: assortmentItems.id,
              kind: assortmentItems.kind,
              archivedAt: assortmentItems.archivedAt,
            })
            .from(assortmentItems)
            .where(inArray(assortmentItems.id, ids))
        : [];
    const current = id
      ? await db
          .select({ componentId: compositeComponents.componentId })
          .from(compositeComponents)
          .where(eq(compositeComponents.compositeId, id))
      : [];
    const kept = new Set(current.map((row) => row.componentId));
    for (const componentId of ids) {
      const item = found.find((candidate) => candidate.id === componentId);
      if (!item || item.kind !== "product") {
        return {
          ok: false as const,
          error: "Only products can go into a composite.",
        };
      }
      // One that's already in may stay after being archived, not be added.
      if (item.archivedAt && !kept.has(componentId)) {
        return {
          ok: false as const,
          error: "An archived item can't be added.",
        };
      }
    }

    const categoryId = await resolveCategory(fields.categoryId, newCategoryName);
    if (!categoryId) {
      return { ok: false as const, error: "Choose a category." };
    }

    let compositeId = id;
    if (compositeId) {
      await db
        .update(assortmentItems)
        .set({ ...fields, categoryId, updatedAt: new Date() })
        .where(eq(assortmentItems.id, compositeId));
    } else {
      const [created] = await db
        .insert(assortmentItems)
        .values({
          ...fields,
          kind: "composite",
          categoryId,
          position: await nextItemPosition(categoryId),
        })
        .returning({ id: assortmentItems.id });
      compositeId = created.id;
    }

    const removed = [...kept].filter((componentId) => !ids.includes(componentId));
    await db.batch([
      db
        .delete(compositeComponents)
        .where(
          and(
            eq(compositeComponents.compositeId, compositeId),
            inArray(compositeComponents.componentId, removed)
          )
        ),
      ...components.map((component, position) =>
        db
          .insert(compositeComponents)
          .values({
            compositeId,
            componentId: component.componentId,
            quantity: component.quantity,
            position,
          })
          .onConflictDoUpdate({
            target: [
              compositeComponents.compositeId,
              compositeComponents.componentId,
            ],
            set: { quantity: component.quantity, position },
          })
      ),
    ]);

    revalidateItemScreens();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not save the composite.");
  }
}

// What's still being put together shouldn't include an item that's going away.
// What was sent is history, and keeps its own copy of the item's details.
function removeFromDrafts(itemId: number) {
  return db.delete(orderLines).where(
    and(
      eq(orderLines.itemId, itemId),
      inArray(
        orderLines.orderId,
        db
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.status, "draft"))
      )
    )
  );
}

export async function setItemArchived(itemId: number, archived: boolean) {
  try {
    const update = db
      .update(assortmentItems)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(assortmentItems.id, itemId));
    if (archived) await db.batch([removeFromDrafts(itemId), update]);
    else await update;
    revalidateItemScreens();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not archive the item.");
  }
}

export async function deleteItem(itemId: number) {
  try {
    // A composite's sum would quietly drop it. Archiving keeps it counted.
    const uses = await db
      .select({ name: assortmentItems.name })
      .from(compositeComponents)
      .innerJoin(
        assortmentItems,
        eq(assortmentItems.id, compositeComponents.compositeId)
      )
      .where(eq(compositeComponents.componentId, itemId));
    if (uses.length > 0) {
      return {
        ok: false as const,
        error: `It goes into ${uses.map((use) => use.name).join(", ")}; take it out there first, or archive it.`,
      };
    }
    await db.batch([
      removeFromDrafts(itemId),
      db
        .update(orderLines)
        .set({ itemId: null })
        .where(eq(orderLines.itemId, itemId)),
      // A composite's own components go with it.
      db
        .delete(compositeComponents)
        .where(eq(compositeComponents.compositeId, itemId)),
      db.delete(assortmentItems).where(eq(assortmentItems.id, itemId)),
    ]);
    revalidateItemScreens();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not delete the item.");
  }
}
