import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  assortmentCategories,
  assortmentItemImages,
  assortmentItems,
  compositeComponents,
  supplierProducts,
} from "@/db/schema";
import { getCategories } from "@/lib/assortment/queries";
import { getDiscountStatuses } from "@/lib/products/discounts";
import {
  getProductPurchaseHistory,
  lastPaidLine,
} from "@/lib/products/purchases";
import { getProductPriceChanges } from "@/lib/products/queries";
import {
  getPricedProducts,
  getPricingCategories,
  getPricingItem,
  getPricingSettings,
  getSalePriceHistory,
} from "@/lib/pricing/queries";

// Items with a dialog and a page of their own; notes have neither.
const WITH_PAGE = inArray(assortmentItems.kind, ["product", "composite"]);

// Where a supplier product leads to in our own assortment. Usually one item,
// but the same product can be sold as several, like the tap and the OWEE beer.
export type ItemLink = {
  id: number;
  // Tells items apart when they share a name, which those two do.
  label: string;
  archived: boolean;
};

function selectLinkedItems() {
  return db
    .select({
      id: assortmentItems.id,
      name: assortmentItems.name,
      categoryName: assortmentCategories.name,
      archivedAt: assortmentItems.archivedAt,
      itemNo: supplierProducts.itemNo,
    })
    .from(assortmentItems)
    .innerJoin(
      assortmentCategories,
      eq(assortmentItems.categoryId, assortmentCategories.id)
    )
    .innerJoin(
      supplierProducts,
      eq(assortmentItems.supplierProductId, supplierProducts.id)
    );
}

type LinkedItem = Awaited<ReturnType<typeof selectLinkedItems>>[number];

// The items of one product.
function toLinks(items: LinkedItem[]): ItemLink[] {
  const active = items.filter((item) => item.archivedAt === null);
  return items.map((item) => {
    const archived = item.archivedAt !== null;
    const namesake = active.some(
      (other) => other.id !== item.id && other.name === item.name
    );
    return {
      id: item.id,
      label: archived
        ? `${item.name} (archived)`
        : namesake
          ? `${item.name} (${item.categoryName})`
          : item.name,
      archived,
    };
  });
}

// Per item number, for the screens that list supplier products. The assortment
// is small, so this is simply all of it. An archived item only shows when
// nothing has replaced it.
export async function getItemLinksByItemNo() {
  const items = await selectLinkedItems()
    .where(eq(assortmentItems.kind, "product"))
    .orderBy(asc(assortmentCategories.position), asc(assortmentItems.position));

  const grouped = new Map<string, LinkedItem[]>();
  for (const item of items) {
    grouped.set(item.itemNo, [...(grouped.get(item.itemNo) ?? []), item]);
  }

  const links = new Map<string, ItemLink[]>();
  for (const [itemNo, group] of grouped) {
    const all = toLinks(group);
    const active = all.filter((link) => !link.archived);
    links.set(itemNo, active.length > 0 ? active : all);
  }
  return links;
}

export async function getItemName(itemId: number) {
  const item = await db.query.assortmentItems.findFirst({
    where: and(eq(assortmentItems.id, itemId), WITH_PAGE),
    columns: { name: true },
  });
  return item?.name ?? null;
}

// What the item dialog edits, plus what it shows of the linked product. It finds
// archived items too; notes have no dialog.
async function getEditableItem(itemId: number) {
  const [row] = await db
    .select({
      item: assortmentItems,
      itemNo: supplierProducts.itemNo,
      supplierDescription: supplierProducts.description,
      unitOfMeasure: supplierProducts.unitOfMeasure,
      unitPrice: supplierProducts.unitPrice,
      imageStatus: supplierProducts.imageStatus,
      ownImageId: assortmentItemImages.itemId,
    })
    .from(assortmentItems)
    .leftJoin(
      supplierProducts,
      eq(assortmentItems.supplierProductId, supplierProducts.id)
    )
    .leftJoin(
      assortmentItemImages,
      eq(assortmentItemImages.itemId, assortmentItems.id)
    )
    .where(and(eq(assortmentItems.id, itemId), WITH_PAGE))
    .limit(1);
  if (!row) return null;

  const { item, ownImageId, ...product } = row;
  return { ...item, ...product, hasOwnImage: ownImageId !== null };
}

export type EditableItem = NonNullable<
  Awaited<ReturnType<typeof getEditableItem>>
>;

// The composites an item goes into, for listing with it. Archived composites
// don't count; they aren't sold.
export async function getCompositesUsing(itemId: number) {
  return db
    .select({
      id: assortmentItems.id,
      name: assortmentItems.name,
      quantity: compositeComponents.quantity,
    })
    .from(compositeComponents)
    .innerJoin(
      assortmentItems,
      eq(assortmentItems.id, compositeComponents.compositeId)
    )
    .where(
      and(
        eq(compositeComponents.componentId, itemId),
        isNull(assortmentItems.archivedAt)
      )
    )
    .orderBy(asc(assortmentItems.name));
}

// What a composite is made of, in the order it was put together.
async function getComponents(compositeId: number) {
  return db
    .select({
      componentId: compositeComponents.componentId,
      quantity: compositeComponents.quantity,
    })
    .from(compositeComponents)
    .where(eq(compositeComponents.compositeId, compositeId))
    .orderBy(asc(compositeComponents.position), asc(compositeComponents.id));
}

// A composite's dialog also needs what can go into it, with prices and costs
// to add up while you put it together.
export async function getItemDialogData(
  itemId?: number,
  options: { composite?: boolean } = {}
) {
  const [item, salePriceHistory, orderCategories, pricingCategories, settings] =
    await Promise.all([
      itemId != null ? getEditableItem(itemId) : null,
      itemId != null ? getSalePriceHistory(itemId) : [],
      getCategories(),
      getPricingCategories(),
      getPricingSettings(),
    ]);
  const composite =
    item != null ? item.kind === "composite" : !!options.composite;
  const [components, componentOptions, usedIn] = await Promise.all([
    item && composite ? getComponents(item.id) : [],
    composite ? getComponentOptions() : [],
    item && !composite ? getCompositesUsing(item.id) : [],
  ]);
  return {
    item,
    composite,
    salePriceHistory,
    orderCategories,
    pricingCategories,
    priceRounding: settings.priceRounding,
    components,
    componentOptions,
    usedIn,
  };
}

async function getComponentOptions() {
  const rows = await getPricedProducts();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    categoryName: row.orderCategoryName,
    salePrice: row.salePrice,
    cost: row.cost,
    archived: row.archivedAt !== null,
  }));
}

export type ComponentOption = Awaited<
  ReturnType<typeof getComponentOptions>
>[number];

export type ItemDialogData = Awaited<ReturnType<typeof getItemDialogData>>;

// Everything we know about one item: what the order page, the pricing screen,
// the invoices and the catalog each say about it.
export async function getItemDetail(itemId: number) {
  const [[base], pricing, salePriceHistory] = await Promise.all([
    db
      .select({
        item: assortmentItems,
        orderCategory: assortmentCategories.name,
        product: supplierProducts,
      })
      .from(assortmentItems)
      .innerJoin(
        assortmentCategories,
        eq(assortmentItems.categoryId, assortmentCategories.id)
      )
      .leftJoin(
        supplierProducts,
        eq(assortmentItems.supplierProductId, supplierProducts.id)
      )
      .where(eq(assortmentItems.id, itemId))
      .limit(1),
    getPricingItem(itemId),
    getSalePriceHistory(itemId),
  ]);
  if (!base || !pricing) return null;

  const { item, orderCategory, product } = base;
  const [purchases, priceChanges, discounts, siblings] = product
    ? await Promise.all([
        getProductPurchaseHistory(product.itemNo),
        getProductPriceChanges(product.id),
        getDiscountStatuses([product.itemNo]),
        selectLinkedItems()
          .where(
            and(
              eq(assortmentItems.supplierProductId, product.id),
              eq(assortmentItems.kind, "product")
            )
          )
          .orderBy(
            asc(assortmentCategories.position),
            asc(assortmentItems.position)
          ),
      ])
    : [[], [], null, []];

  return {
    item,
    orderCategory,
    product,
    pricing,
    salePriceHistory,
    purchases,
    lastPaid: lastPaidLine(purchases),
    priceChanges,
    // Line discount as last invoiced; never invoiced is unknown, not none.
    discount: product
      ? (discounts?.get(product.itemNo) ?? { kind: "unknown" as const })
      : null,
    // Other items on the same supplier product.
    sharedWith: toLinks(siblings).filter((link) => link.id !== item.id),
  };
}
