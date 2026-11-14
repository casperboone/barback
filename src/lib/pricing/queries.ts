import { and, asc, desc, eq, gte, inArray, isNull, min, or } from "drizzle-orm";
import { db } from "@/db";
import {
  assortmentCategories,
  assortmentItemImages,
  assortmentItems,
  compositeComponents,
  pricingCategories,
  pricingSettings,
  salePriceChanges,
  supplierProducts,
  type PricingCategory,
  type PricingSettings,
} from "@/db/schema";
import {
  advicePrice,
  alcoholPrice,
  margin,
  portionCost,
  portionsPerUnit,
  roundPrice,
} from "./calc";
import { compositeCost, compositeSum, pricesDiffer } from "./composite";
import { getQuantitiesByYear } from "@/lib/products/purchases";

// What the pricing screen and an item's own page work from; they differ in
// which items they ask for.
function selectPricingItems() {
  return db
    .select({
      id: assortmentItems.id,
      kind: assortmentItems.kind,
      name: assortmentItems.name,
      orderCategoryId: assortmentItems.categoryId,
      orderCategoryName: assortmentCategories.name,
      pricingCategoryId: assortmentItems.pricingCategoryId,
      notForSale: assortmentItems.notForSale,
      special: assortmentItems.special,
      archivedAt: assortmentItems.archivedAt,
      itemNo: supplierProducts.itemNo,
      supplierDescription: supplierProducts.description,
      removedAt: supplierProducts.removedAt,
      imageStatus: supplierProducts.imageStatus,
      ownImageId: assortmentItemImages.itemId,
      unitOfMeasure: supplierProducts.unitOfMeasure,
      catalogPrice: supplierProducts.unitPrice,
      manualPurchasePrice: assortmentItems.manualPurchasePrice,
      purchaseSource: assortmentItems.purchaseSource,
      unitVolume: assortmentItems.unitVolume,
      portionVolume: assortmentItems.portionVolume,
      portionsPerUnitOverride: assortmentItems.portionsPerUnit,
      alcoholPercentage: assortmentItems.alcoholPercentage,
      vatRateOverride: assortmentItems.vatRate,
      salePrice: assortmentItems.salePrice,
      salePriceCost: assortmentItems.salePriceCost,
      salePriceReference: assortmentItems.salePriceReference,
    })
    .from(assortmentItems)
    .innerJoin(
      assortmentCategories,
      eq(assortmentItems.categoryId, assortmentCategories.id),
    )
    .leftJoin(
      supplierProducts,
      eq(assortmentItems.supplierProductId, supplierProducts.id),
    )
    .leftJoin(
      assortmentItemImages,
      eq(assortmentItemImages.itemId, assortmentItems.id),
    );
}

const ACTIVE_PRODUCT = and(
  eq(assortmentItems.kind, "product"),
  isNull(assortmentItems.archivedAt),
);

const PRICED = inArray(assortmentItems.kind, ["product", "composite"]);

// Every link between a composite and its components. Small enough to read
// whole, and a composite needs its components' rows to be worked out.
export async function getCompositeLinks() {
  return db
    .select({
      compositeId: compositeComponents.compositeId,
      componentId: compositeComponents.componentId,
      quantity: compositeComponents.quantity,
      referencePrice: compositeComponents.referencePrice,
    })
    .from(compositeComponents)
    .orderBy(asc(compositeComponents.position), asc(compositeComponents.id));
}

type CompositeLink = Awaited<ReturnType<typeof getCompositeLinks>>[number];

export const DEFAULT_SETTINGS: PricingSettings = {
  id: 1,
  priceRounding: 0.1,
  adviceTolerance: 0.1,
  alcoholReferenceItemId: null,
};

export async function getPricingSettings(): Promise<PricingSettings> {
  const row = await db.query.pricingSettings.findFirst({
    where: eq(pricingSettings.id, 1),
  });
  return row ?? DEFAULT_SETTINGS;
}

export async function getPricingCategories() {
  return db
    .select()
    .from(pricingCategories)
    .orderBy(asc(pricingCategories.position), asc(pricingCategories.id));
}

export type MissingField =
  | "category"
  | "purchasePrice"
  | "portions"
  | "salePrice"
  // Composites only.
  | "components"
  | "componentPrices"
  | "componentCosts";

export type CompositeRowComponent = {
  id: number;
  name: string;
  quantity: number;
  salePrice: number | null;
  cost: number | null;
  archived: boolean;
  // Its price when the composite's price was set.
  referencePrice: number | null;
};

// A composite an item goes into, as shown with that item.
export type CompositeUse = {
  id: number;
  name: string;
  quantity: number;
  salePrice: number | null;
  sum: number | null;
};

export type PricingRow = {
  id: number;
  kind: "product" | "composite";
  name: string;
  orderCategoryId: number;
  orderCategoryName: string;
  pricingCategoryId: number | null;
  notForSale: boolean;
  special: boolean;
  archivedAt: Date | null;
  itemNo: string | null;
  supplierDescription: string | null;
  supplierRemoved: boolean;
  imageStatus: "available" | "none" | null;
  hasOwnImage: boolean;
  unitOfMeasure: string | null;
  catalogPrice: number | null;
  manualPurchasePrice: number | null;
  purchaseSource: string | null;
  unitVolume: number | null;
  portionVolume: number | null;
  portionsPerUnitOverride: number | null;
  alcoholPercentage: number | null;
  vatRateOverride: number | null;
  salePrice: number | null;
  salePriceCost: number | null;
  // Composites: the components' sum when the price was set.
  salePriceReference: number | null;

  // Derived.
  purchasePrice: number | null;
  vatRate: number | null;
  portions: number | null;
  cost: number | null;
  advice: number | null;
  adviceRounded: number | null;
  margin: number | null;
  profit: number | null;
  alcoholPrice: number | null;
  // Bought according to the invoices, in purchase units and in portions.
  bought: {
    thisYear: { units: number; portions: number | null } | null;
    lastYear: { units: number; portions: number | null } | null;
  };
  // Composites: what goes in and what that sells for together. A composite
  // has no pricing category, so no advice either; the sum takes its place.
  composite: { components: CompositeRowComponent[]; sum: number | null } | null;
  // Products: the composites they go into, which a new price changes.
  usedIn: CompositeUse[];
  signals: {
    missing: MissingField[];
    belowAdvice: boolean;
    lowMargin: boolean;
    costChanged: boolean;
    cheapAlcohol: boolean;
    // Composites only.
    differsFromSum: boolean;
    sumChanged: boolean;
    archivedComponent: boolean;
  };
};

export type PricingOverview = {
  rows: PricingRow[];
  // The years the "bought" columns cover; this one only up to today.
  years: { thisYear: string; lastYear: string };
  categories: PricingCategory[];
  settings: PricingSettings;
  reference: { id: number; name: string; alcoholPrice: number | null } | null;
  // The first recorded sale price change; prices can't be compared before it.
  historyStart: Date | null;
};

// Calendar years as the invoice dates are stored, like purchase history.
function boughtYears() {
  const thisYear = String(new Date().getUTCFullYear());
  return { thisYear, lastYear: String(Number(thisYear) - 1) };
}

type PricingItemRecord = Awaited<ReturnType<typeof selectPricingItems>>[number];

function toPricingRow(
  { removedAt, ownImageId, kind, ...item }: PricingItemRecord,
  context: {
    category: PricingCategory | undefined;
    settings: PricingSettings;
    quantities: Awaited<ReturnType<typeof getQuantitiesByYear>>;
    years: PricingOverview["years"];
  },
): PricingRow {
  const { category, settings, quantities, years } = context;
  const purchasePrice = item.manualPurchasePrice ?? item.catalogPrice;
  const input = {
    purchasePrice,
    unitVolume: item.unitVolume,
    portionVolume: item.portionVolume,
    portionsPerUnit: item.portionsPerUnitOverride,
    vatRate: item.vatRateOverride,
    alcoholPercentage: item.alcoholPercentage,
  };
  const portions = portionsPerUnit(input);
  const cost = category ? portionCost(input, category) : null;
  const advice = category && cost != null ? advicePrice(cost, category) : null;
  const adviceRounded =
    advice != null ? roundPrice(advice, settings.priceRounding) : null;
  const sale = item.salePrice;

  const missing: MissingField[] = [];
  if (!category) missing.push("category");
  if (purchasePrice == null) missing.push("purchasePrice");
  if (!portions) missing.push("portions");
  if (sale == null) missing.push("salePrice");

  const boughtIn = (year: string) => {
    // Linked but never invoiced is a real zero; unlinked is unknown.
    const units = item.itemNo
      ? (quantities.get(item.itemNo)?.get(year) ?? 0)
      : undefined;
    if (units == null) return null;
    return { units, portions: portions ? units * portions : null };
  };

  const rowMargin = sale && cost != null ? margin(sale, cost) : null;

  return {
    ...item,
    kind: kind === "composite" ? "composite" : "product",
    supplierRemoved: removedAt !== null,
    hasOwnImage: ownImageId !== null,
    purchasePrice,
    vatRate: item.vatRateOverride ?? category?.vatRate ?? null,
    portions,
    cost,
    advice,
    adviceRounded,
    margin: rowMargin,
    profit: sale != null && cost != null ? sale - cost : null,
    alcoholPrice:
      sale != null
        ? alcoholPrice(sale, item.alcoholPercentage, item.portionVolume)
        : null,
    bought: {
      thisYear: boughtIn(years.thisYear),
      lastYear: boughtIn(years.lastYear),
    },
    composite: null,
    usedIn: [],
    signals: {
      missing,
      // Charging more than the advice is fine; only less gets flagged.
      belowAdvice:
        sale != null &&
        adviceRounded != null &&
        adviceRounded - sale > adviceRounded * settings.adviceTolerance + 0.001,
      // The blended margin never drops below the premium margin, so
      // anything under it is priced below what the model allows.
      lowMargin:
        rowMargin != null && !!category && rowMargin < category.premiumMargin,
      costChanged:
        cost != null &&
        item.salePriceCost != null &&
        Math.abs(cost - item.salePriceCost) >= 0.005,
      cheapAlcohol: false,
      differsFromSum: false,
      sumChanged: false,
      archivedComponent: false,
    },
  };
}

// A composite's row, from the rows of its components: the sum of what they
// sell for stands in for the advice, and their costs add up to its cost.
function toCompositeRow(
  item: PricingItemRecord,
  links: CompositeLink[],
  productRows: Map<number, PricingRow>,
): PricingRow {
  const components: CompositeRowComponent[] = links.flatMap((link) => {
    const row = productRows.get(link.componentId);
    if (!row) return [];
    return [
      {
        id: row.id,
        name: row.name,
        quantity: link.quantity,
        salePrice: row.salePrice,
        cost: row.cost,
        archived: row.archivedAt !== null,
        referencePrice: link.referencePrice,
      },
    ];
  });
  const sum = compositeSum(components);
  const cost = compositeCost(components);
  const sale = item.salePrice;

  const missing: MissingField[] = [];
  if (components.length === 0) missing.push("components");
  else {
    if (sum == null) missing.push("componentPrices");
    if (cost == null) missing.push("componentCosts");
  }
  if (sale == null) missing.push("salePrice");

  return {
    ...toPricingRow(item, {
      category: undefined,
      settings: DEFAULT_SETTINGS,
      quantities: new Map(),
      years: { thisYear: "", lastYear: "" },
    }),
    // Nothing to buy, so none of what buying brings.
    pricingCategoryId: null,
    notForSale: false,
    itemNo: null,
    supplierDescription: null,
    supplierRemoved: false,
    imageStatus: null,
    unitOfMeasure: null,
    catalogPrice: null,
    manualPurchasePrice: null,
    purchaseSource: null,
    purchasePrice: null,
    vatRate: null,
    portions: null,
    cost,
    advice: null,
    adviceRounded: null,
    margin: sale && cost != null ? margin(sale, cost) : null,
    profit: sale != null && cost != null ? sale - cost : null,
    alcoholPrice: null,
    bought: { thisYear: null, lastYear: null },
    composite: { components, sum },
    signals: {
      missing,
      belowAdvice: false,
      lowMargin: false,
      costChanged:
        cost != null &&
        item.salePriceCost != null &&
        Math.abs(cost - item.salePriceCost) >= 0.005,
      cheapAlcohol: false,
      differsFromSum: pricesDiffer(sale, sum),
      sumChanged: pricesDiffer(sum, item.salePriceReference),
      archivedComponent: components.some((component) => component.archived),
    },
  };
}

type RowContext = {
  categories: PricingCategory[];
  settings: PricingSettings;
  quantities: Awaited<ReturnType<typeof getQuantitiesByYear>>;
  years: PricingOverview["years"];
};

// Products first, since composites are worked out from them; then each
// product hears which (unarchived) composites it goes into.
function assembleRows(
  items: PricingItemRecord[],
  links: CompositeLink[],
  context: RowContext,
) {
  const { categories, ...rest } = context;
  const rows = new Map<number, PricingRow>();
  for (const item of items) {
    if (item.kind !== "product") continue;
    rows.set(
      item.id,
      toPricingRow(item, {
        ...rest,
        category: categories.find((c) => c.id === item.pricingCategoryId),
      }),
    );
  }
  for (const item of items) {
    if (item.kind !== "composite") continue;
    rows.set(
      item.id,
      toCompositeRow(
        item,
        links.filter((link) => link.compositeId === item.id),
        rows,
      ),
    );
  }
  for (const link of links) {
    const composite = rows.get(link.compositeId);
    const component = rows.get(link.componentId);
    if (!composite?.composite || !component || composite.archivedAt) continue;
    component.usedIn.push({
      id: composite.id,
      name: composite.name,
      quantity: link.quantity,
      salePrice: composite.salePrice,
      sum: composite.composite.sum,
    });
  }
  return rows;
}

// Items in use, plus archived ones a composite still uses: those still count
// towards its sum.
const IN_USE_OR_COMPONENT = and(
  PRICED,
  or(
    isNull(assortmentItems.archivedAt),
    inArray(
      assortmentItems.id,
      db
        .select({ id: compositeComponents.componentId })
        .from(compositeComponents),
    ),
  ),
);

function isCheapAlcohol(
  row: PricingRow,
  reference: NonNullable<PricingOverview["reference"]>,
) {
  return (
    reference.alcoholPrice != null &&
    row.id !== reference.id &&
    row.alcoholPrice != null &&
    row.alcoholPrice < reference.alcoholPrice - 0.005
  );
}

export async function getPricingOverview(): Promise<PricingOverview> {
  const [items, links, categories, settings, historyStart] = await Promise.all([
    selectPricingItems()
      .where(IN_USE_OR_COMPONENT)
      .orderBy(
        asc(assortmentCategories.position),
        asc(assortmentItems.position),
        asc(assortmentItems.id),
      ),
    getCompositeLinks(),
    getPricingCategories(),
    getPricingSettings(),
    getSalePriceHistoryStart(),
  ]);

  const years = boughtYears();
  const quantities = await getQuantitiesByYear([
    years.thisYear,
    years.lastYear,
  ]);

  const byId = assembleRows(items, links, {
    categories,
    settings,
    quantities,
    years,
  });
  const rows = items
    .filter((item) => item.archivedAt === null)
    .map((item) => byId.get(item.id)!);

  const referenceRow = settings.alcoholReferenceItemId
    ? rows.find(
        (row) =>
          row.id === settings.alcoholReferenceItemId && row.kind === "product",
      )
    : undefined;
  const reference = referenceRow
    ? {
        id: referenceRow.id,
        name: referenceRow.name,
        alcoholPrice: referenceRow.alcoholPrice,
      }
    : null;
  if (reference) {
    for (const row of rows) {
      row.signals.cheapAlcohol = isCheapAlcohol(row, reference);
    }
  }

  return { rows, years, categories, settings, reference, historyStart };
}

// Every product with its cost and price, for putting a composite together.
// Archived ones a composite still uses are included, so it can show them.
export async function getPricedProducts() {
  const [items, categories, settings] = await Promise.all([
    selectPricingItems()
      .where(and(IN_USE_OR_COMPONENT, eq(assortmentItems.kind, "product")))
      .orderBy(
        asc(assortmentCategories.position),
        asc(assortmentItems.position),
        asc(assortmentItems.id),
      ),
    getPricingCategories(),
    getPricingSettings(),
  ]);
  const rows = assembleRows(items, [], {
    categories,
    settings,
    quantities: new Map(),
    years: boughtYears(),
  });
  return items.map((item) => rows.get(item.id)!);
}

export type PricingItem = {
  row: PricingRow;
  category: PricingCategory | null;
  years: PricingOverview["years"];
  reference: PricingOverview["reference"];
};

// One item's row, worked out exactly like the overview does. Unlike the
// overview it also finds archived items, which still have a page of their own.
export async function getPricingItem(
  itemId: number,
): Promise<PricingItem | null> {
  const [[item], links, categories, settings] = await Promise.all([
    selectPricingItems()
      .where(and(eq(assortmentItems.id, itemId), PRICED))
      .limit(1),
    getCompositeLinks(),
    getPricingCategories(),
    getPricingSettings(),
  ]);
  if (!item) return null;

  // Its components, or the composites it goes into with their components,
  // since those decide the sums it shows.
  const composites = new Set(
    item.kind === "composite"
      ? [item.id]
      : links
          .filter((link) => link.componentId === item.id)
          .map((link) => link.compositeId),
  );
  const relatedIds = new Set<number>(composites);
  for (const link of links) {
    if (composites.has(link.compositeId)) relatedIds.add(link.componentId);
  }
  relatedIds.delete(item.id);

  const years = boughtYears();
  const [quantities, related, [referenceItem]] = await Promise.all([
    item.itemNo
      ? getQuantitiesByYear([years.thisYear, years.lastYear], [item.itemNo])
      : new Map<string, Map<string, number>>(),
    relatedIds.size > 0
      ? selectPricingItems().where(
          and(inArray(assortmentItems.id, [...relatedIds]), PRICED),
        )
      : [],
    settings.alcoholReferenceItemId
      ? selectPricingItems()
          .where(
            and(
              eq(assortmentItems.id, settings.alcoholReferenceItemId),
              ACTIVE_PRODUCT,
            ),
          )
          .limit(1)
      : [],
  ]);

  const categoryOf = (id: number | null) =>
    categories.find((category) => category.id === id);
  const context = { settings, quantities, years };
  const category =
    item.kind === "product" ? categoryOf(item.pricingCategoryId) : undefined;
  const row = assembleRows([item, ...related], links, {
    ...context,
    categories,
  }).get(item.id)!;

  const referenceRow =
    referenceItem &&
    toPricingRow(referenceItem, {
      ...context,
      category: categoryOf(referenceItem.pricingCategoryId),
    });
  const reference = referenceRow
    ? {
        id: referenceRow.id,
        name: referenceRow.name,
        alcoholPrice: referenceRow.alcoholPrice,
      }
    : null;
  if (reference && row.kind === "product") {
    row.signals.cheapAlcohol = isCheapAlcohol(row, reference);
  }

  return { row, category: category ?? null, years, reference };
}

export async function getSalePriceHistory(itemId: number) {
  return db
    .select()
    .from(salePriceChanges)
    .where(eq(salePriceChanges.itemId, itemId))
    .orderBy(desc(salePriceChanges.createdAt), desc(salePriceChanges.id));
}

// The sale price each item had when `since` came, for items whose price has
// changed after it: the old price of its first change from then on. Items
// missing from the map still have the price they had then.
export async function getSalePricesAt(since: Date) {
  const changes = await db
    .select({
      itemId: salePriceChanges.itemId,
      oldPrice: salePriceChanges.oldPrice,
    })
    .from(salePriceChanges)
    .where(gte(salePriceChanges.createdAt, since))
    .orderBy(asc(salePriceChanges.createdAt), asc(salePriceChanges.id));

  const prices = new Map<number, number | null>();
  for (const change of changes) {
    if (!prices.has(change.itemId)) prices.set(change.itemId, change.oldPrice);
  }
  return prices;
}

// When the price history begins; before it, there's nothing to compare to.
export async function getSalePriceHistoryStart() {
  const [row] = await db
    .select({ first: min(salePriceChanges.createdAt) })
    .from(salePriceChanges);
  return row?.first ?? null;
}
