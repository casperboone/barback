import { netUnitPrice } from "@/lib/products/net-unit-price";
import { isNonProductLine, type RustDocument } from "./matching";

// Whether Rust charged what we ordered at. The price on a line is the catalog
// price when it went to the cart, which is net of the line discount, so it's
// compared with what a unit came to on Rust's documents, discount included.

export type PricedLine = {
  id: number;
  itemNo: string | null;
  quantity: number;
  unitPrice: number | null;
};

export type PriceDifference = {
  id: number;
  ordered: number;
  // Per unit at Rust. When it varies between documents, the average.
  charged: number;
  // Charged less ordered, in whole cents: positive means it cost more.
  perUnit: number;
  // What Rust charged of it for this line.
  quantity: number;
  total: number;
  // The invoice once there is one, before that the Rust order.
  source: "order" | "invoice";
  documentNos: string[];
  // Not one price on Rust's side.
  varies: boolean;
};

// Prices are compared in cents, so float noise (or a catalog price with four
// decimals, which Rust has) never counts as a difference, and one cent does.
export const toCents = (value: number) =>
  Math.round(Math.round(value * 1e6) / 1e4);

// The rule the rest of the app uses, with the list price less the discount for
// a line that somehow has no total.
function chargedPerUnit(line: RustDocument["lines"][number]) {
  const net = netUnitPrice(line.quantity, line.amount ?? null);
  if (net != null) return net;
  if (line.unitPrice == null || !line.quantity || line.quantity <= 0) {
    return null;
  }
  return line.unitPrice * (1 - (line.discountPercent ?? 0) / 100);
}

type Charge = {
  documentNo: string;
  unitPrice: number;
  quantity: number;
};

export function comparePrices(
  lines: PricedLine[],
  documents: RustDocument[]
): PriceDifference[] {
  const charges = {
    order: new Map<string, Charge[]>(),
    invoice: new Map<string, Charge[]>(),
  };
  // Credit notes are left out: they refund, they don't set a price. Returns
  // and deposits have no price of their own here either.
  for (const document of documents) {
    if (document.type === "creditmemo") continue;
    for (const line of document.lines) {
      if (isNonProductLine(line) || !line.quantity || line.quantity <= 0) {
        continue;
      }
      const unitPrice = chargedPerUnit(line);
      if (unitPrice == null) continue;
      const pool = charges[document.type];
      pool.set(line.itemNo, [
        ...(pool.get(line.itemNo) ?? []),
        { documentNo: document.documentNo, unitPrice, quantity: line.quantity },
      ]);
    }
  }

  // The Rust order goes once its invoice is in: that's what we pay. Per
  // product, because a second Rust order can still be open.
  const chargesFor = (itemNo: string) => {
    const invoiced = charges.invoice.get(itemNo);
    if (invoiced) return { source: "invoice" as const, list: invoiced };
    const ordered = charges.order.get(itemNo);
    return ordered ? { source: "order" as const, list: ordered } : null;
  };

  // Only lines with a price and a product to find. A replacement has no price
  // of ours, so a substituted line is held to its own product only.
  const comparable = lines.filter(
    (line): line is PricedLine & { itemNo: string; unitPrice: number } =>
      line.itemNo !== null && line.unitPrice !== null
  );

  // Two lines can be one product: each gets what it asked for in turn, and the
  // last gets whatever is left, like the matching does.
  const left = new Map<string, number>();
  const lastOf = new Map<string, number>();
  for (const line of comparable) {
    lastOf.set(line.itemNo, line.id);
    if (left.has(line.itemNo)) continue;
    const found = chargesFor(line.itemNo);
    left.set(
      line.itemNo,
      found?.list.reduce((sum, charge) => sum + charge.quantity, 0) ?? 0
    );
  }

  const differences: PriceDifference[] = [];
  for (const line of comparable) {
    const found = chargesFor(line.itemNo);
    if (!found) continue;
    const available = left.get(line.itemNo)!;
    const quantity =
      lastOf.get(line.itemNo) === line.id
        ? available
        : Math.min(available, line.quantity);
    left.set(line.itemNo, available - quantity);
    if (quantity <= 0) continue;

    const ordered = toCents(line.unitPrice);
    const prices = new Set(found.list.map((charge) => toCents(charge.unitPrice)));
    if (prices.size === 1 && prices.has(ordered)) continue;

    const units = found.list.reduce((sum, charge) => sum + charge.quantity, 0);
    const charged =
      found.list.reduce(
        (sum, charge) => sum + charge.unitPrice * charge.quantity,
        0
      ) / units;
    const perUnit = (toCents(charged) - ordered) / 100;
    differences.push({
      id: line.id,
      ordered: line.unitPrice,
      charged,
      perUnit,
      quantity,
      total: Math.round(perUnit * quantity * 100) / 100,
      source: found.source,
      documentNos: [...new Set(found.list.map((charge) => charge.documentNo))],
      varies: prices.size > 1,
    });
  }
  return differences;
}
