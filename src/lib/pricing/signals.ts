import { formatPrice } from "@/lib/format";
import { priceTone } from "./calc";
import { movedComponents, pricesDiffer } from "./composite";
import type { MissingField, PricingRow } from "./queries";

const MISSING_LABELS: Record<MissingField, string> = {
  category: "pricing category",
  purchasePrice: "purchase price",
  portions: "portions",
  salePrice: "sale price",
  components: "components",
  componentPrices: "sale price for every component",
  componentCosts: "cost for every component",
};

// What's missing, naming the components it's missing on.
function missingText(row: PricingRow, field: MissingField) {
  const components = row.composite?.components ?? [];
  const names = (key: "salePrice" | "cost") =>
    components
      .filter((component) => component[key] == null)
      .map((component) => component.name)
      .join(", ");
  if (field === "componentPrices") return `sale price for ${names("salePrice")}`;
  if (field === "componentCosts") return `cost for ${names("cost")}`;
  return MISSING_LABELS[field];
}

// Whether a row shows up under "Needs attention".
export function needsAttention(row: PricingRow) {
  const { signals } = row;
  return (
    row.supplierRemoved ||
    signals.missing.length > 0 ||
    signals.belowAdvice ||
    signals.lowMargin ||
    signals.costChanged ||
    signals.cheapAlcohol ||
    signals.differsFromSum ||
    signals.sumChanged ||
    signals.archivedComponent
  );
}

export type SignalKey =
  | "removed"
  | "missing"
  | "archived"
  | "sum"
  | "sumChanged"
  | "margin"
  | "advice"
  | "cost"
  | "alcohol";

// Each kind of flag in a few words, for counting them up.
export const SIGNAL_NAMES: Record<SignalKey, string> = {
  removed: "gone from catalog",
  archived: "uses archived item",
  margin: "low margin",
  cost: "cost moved",
  sumChanged: "sum moved",
  advice: "below advice",
  sum: "differs from sum",
  missing: "missing data",
  alcohol: "cheap alcohol",
};

export type SignalChip = {
  key: SignalKey;
  label: string;
  detail: string;
  tone: "warn" | "bad";
};

// What the pricing model has to say about an item, in words.
export function signalChips(
  row: PricingRow,
  reference: { name?: string; alcoholPrice: number | null },
): SignalChip[] {
  const { signals } = row;
  const chips: SignalChip[] = [];

  if (row.supplierRemoved) {
    chips.push({
      key: "removed",
      label: "Gone from catalog",
      detail:
        row.manualPurchasePrice != null
          ? "Rust no longer lists this product. The cost uses the manual purchase price."
          : `Rust no longer lists this product. The cost still uses its last catalog price of ${formatPrice(row.catalogPrice)}.`,
      tone: "bad",
    });
  }
  if (signals.missing.length > 0) {
    chips.push({
      key: "missing",
      label: "Missing data",
      detail: `No ${signals.missing.map((field) => missingText(row, field)).join(", ")} yet.`,
      tone: "warn",
    });
  }
  if (signals.archivedComponent && row.composite) {
    const archived = row.composite.components
      .filter((component) => component.archived)
      .map((component) => component.name);
    chips.push({
      key: "archived",
      label: "Uses archived item",
      detail: `${archived.join(", ")} ${archived.length === 1 ? "is" : "are"} archived, but still ${archived.length === 1 ? "counts" : "count"} towards the sum.`,
      tone: "bad",
    });
  }
  if (signals.differsFromSum && row.composite?.sum != null && row.salePrice != null) {
    const diff = row.salePrice - row.composite.sum;
    chips.push({
      key: "sum",
      label: `${formatPrice(Math.abs(diff))} ${diff > 0 ? "over" : "under"} sum`,
      detail: `The components sell for ${formatPrice(row.composite.sum)} together.`,
      tone: "warn",
    });
  }
  if (
    signals.sumChanged &&
    row.composite?.sum != null &&
    row.salePriceReference != null
  ) {
    const diff = row.composite.sum - row.salePriceReference;
    const moved = movedComponents(row.composite.components).map(
      (component) =>
        `${component.name} ${formatPrice(component.referencePrice)} → ${formatPrice(component.salePrice)}`,
    );
    chips.push({
      key: "sumChanged",
      label: `Sum ${diff > 0 ? "up" : "down"} ${formatPrice(Math.abs(diff))}`,
      detail: `The components added up to ${formatPrice(row.salePriceReference)} when the price was set, now ${formatPrice(row.composite.sum)}${moved.length > 0 ? `: ${moved.join(", ")}` : ", because what goes in changed"}. Save the price again to accept.`,
      tone: diff > 0 ? "bad" : "warn",
    });
  }
  if (signals.lowMargin) {
    chips.push({
      key: "margin",
      label: "Low margin",
      detail: "The margin is below the category's premium margin.",
      tone: "bad",
    });
  }
  if (
    signals.belowAdvice &&
    row.salePrice != null &&
    row.adviceRounded != null
  ) {
    chips.push({
      key: "advice",
      label: `−${formatPrice(row.adviceRounded - row.salePrice)} vs advice`,
      detail: `Advice is ${formatPrice(row.adviceRounded)}.`,
      tone: "warn",
    });
  }
  if (signals.costChanged && row.cost != null && row.salePriceCost != null) {
    const diff = row.cost - row.salePriceCost;
    chips.push({
      key: "cost",
      label: `Cost ${diff > 0 ? "up" : "down"} ${formatPrice(Math.abs(diff))}`,
      detail: `A portion cost ${formatPrice(row.salePriceCost)} when the price was set, now ${formatPrice(row.cost)}. Save the price again to accept.`,
      tone: diff > 0 ? "bad" : "warn",
    });
  }
  if (signals.cheapAlcohol) {
    chips.push({
      key: "alcohol",
      label: "Cheap alcohol",
      detail: `10 ml of alcohol costs ${formatPrice(row.alcoholPrice)}, less than ${reference.name} (${formatPrice(reference.alcoholPrice)}).`,
      tone: "warn",
    });
  }
  return chips;
}

const TONE_CLASSES = {
  above: "border-green-600/30 bg-green-100 dark:bg-green-500/20",
  below: "border-red-600/30 bg-red-100 dark:bg-red-500/20",
};

// How a composite's price compares to what its components sell for together.
// Unlike the advice, the sum is exact, so any difference counts.
export function sumToneStyle(salePrice: number | null, sum: number | null) {
  if (!pricesDiffer(salePrice, sum)) return null;
  return salePrice! > sum!
    ? { title: "Above the sum", className: TONE_CLASSES.above }
    : { title: "Below the sum", className: TONE_CLASSES.below };
}

// How a sale price compares to the unrounded advice, for showing it coloured.
export function priceToneStyle(
  salePrice: number | null,
  advice: number | null,
) {
  const tone = priceTone(salePrice, advice);
  if (tone === "above") {
    return { title: "Above the advice", className: TONE_CLASSES.above };
  }
  if (tone === "below") {
    return { title: "Below the advice", className: TONE_CLASSES.below };
  }
  return null;
}
