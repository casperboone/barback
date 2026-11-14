import {
  findNotDelivered,
  getSuggestions,
  getTrackedOrders,
  type NotDeliveredLine,
} from "@/lib/orders/queries";
import { getPricingOverview, type PricingRow } from "@/lib/pricing/queries";
import {
  needsAttention,
  SIGNAL_NAMES,
  signalChips,
  type SignalChip,
  type SignalKey,
} from "@/lib/pricing/signals";
import { getOpenEntries, type OpenEntry } from "@/lib/products/open-entries";
import { getSyncStatus, type SyncStatus } from "@/lib/products/queries";
import type { ImportKind } from "@/lib/supplier/import-runs";

// What the home page lists: everything worth doing something about, gathered
// from the screens that have the details. Each part comes from the same query
// or signal as its own screen, so the counts agree.

// An import that hasn't succeeded for this long is out of date. Documents go
// stale sooner, because orders and payments are followed with them.
export const STALE_AFTER_DAYS: Record<ImportKind, number> = {
  catalog: 7,
  documents: 3,
};

// Unpaid invoices due within this many days are worth paying now.
export const DUE_SOON_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type OrderRef = { id: number; name: string | null; sentAt: Date | null };

export type ImportHealth = SyncStatus & {
  // No successful run in STALE_AFTER_DAYS.
  stale: boolean;
  // The latest run failed, or was killed before it could say so.
  failed: boolean;
  // The last run read part of the documents and left the rest for the next.
  unfinished: boolean;
  needsAttention: boolean;
};

export type FlaggedItem = { row: PricingRow; chips: SignalChip[] };

export type Attention = {
  payments: {
    // Oldest first, like the outstanding list.
    overdue: OpenEntry[];
    overdueTotal: number;
    dueSoon: OpenEntry[];
    dueSoonTotal: number;
  };
  orders: {
    notDelivered: NotDeliveredLine[];
    // Sent over two weeks ago, and no invoice yet.
    noInvoice: OrderRef[];
    // Rust's documents that look like they're the order's, to link or turn down.
    toLink: (OrderRef & { count: number })[];
    // Invoiced, with lines the matching can't follow, to tick off by hand.
    toTick: (OrderRef & { count: number })[];
  };
  pricing: {
    // For-sale items the pricing screen flags, worst first.
    flagged: FlaggedItem[];
    counts: { key: SignalKey; name: string; count: number }[];
  };
  // Items on our list whose product Rust no longer lists.
  gone: PricingRow[];
  imports: Record<ImportKind, ImportHealth>;
};

function importHealth(status: SyncStatus, now: Date): ImportHealth {
  const { kind, latest, lastSuccess, running } = status;
  const finishedAt = lastSuccess?.finishedAt;
  const stale =
    !finishedAt ||
    now.getTime() - finishedAt.getTime() > STALE_AFTER_DAYS[kind] * DAY_MS;
  const failed = !running && !!latest && latest.status !== "succeeded";
  const unfinished =
    !running && !failed && !!lastSuccess?.remainingCount;
  return {
    ...status,
    stale,
    failed,
    unfinished,
    // A run under way will settle it either way.
    needsAttention: !running && (stale || failed || unfinished),
  };
}

const orderRef = ({ id, name, sentAt }: OrderRef): OrderRef => ({
  id,
  name,
  sentAt,
});

async function getOrderAttention(): Promise<Attention["orders"]> {
  const tracked = await getTrackedOrders();
  const { lines, overdue } = findNotDelivered(tracked);

  // Unlikely suggestions only share a product; the order page still shows
  // them, but they're no reason to go there.
  const suggestions = await Promise.all(
    tracked.map(async (row) => ({
      order: row.order,
      count: (await getSuggestions(row)).filter(
        (suggestion) => suggestion.confidence !== "low"
      ).length,
    }))
  );

  return {
    notDelivered: lines,
    noInvoice: overdue,
    toLink: suggestions
      .filter((row) => row.count > 0)
      .map((row) => ({ ...orderRef(row.order), count: row.count })),
    // Free text can be ticked off from the start, but only once the invoice
    // is in is there something to check it against.
    toTick: tracked
      .filter(
        ({ progress }) =>
          progress.toTickCount > 0 &&
          (progress.stage === "partly_invoiced" ||
            progress.stage === "invoiced")
      )
      .map(({ order, progress }) => ({
        ...orderRef(order),
        count: progress.toTickCount,
      })),
  };
}

async function getPricingAttention() {
  const { rows, reference } = await getPricingOverview();
  const chipsOf = (row: PricingRow) =>
    signalChips(row, {
      name: reference?.name,
      alcoholPrice: reference?.alcoholPrice ?? null,
    });

  // Same rows as the pricing screen's "Needs attention" view.
  const flagged = rows
    .filter((row) => !row.notForSale && needsAttention(row))
    .map((row) => ({ row, chips: chipsOf(row) }));
  const bad = (item: FlaggedItem) =>
    item.chips.filter((chip) => chip.tone === "bad").length;
  // How far under the advice, as a share of it.
  const gap = ({ row }: FlaggedItem) =>
    row.signals.belowAdvice && row.salePrice != null && row.adviceRounded
      ? (row.adviceRounded - row.salePrice) / row.adviceRounded
      : 0;
  // Red flags first, then the most flags, then the furthest below advice.
  flagged.sort(
    (a, b) =>
      bad(b) - bad(a) || b.chips.length - a.chips.length || gap(b) - gap(a)
  );

  const counts = (Object.keys(SIGNAL_NAMES) as SignalKey[])
    .map((key) => ({
      key,
      name: SIGNAL_NAMES[key],
      count: flagged.filter((item) =>
        item.chips.some((chip) => chip.key === key)
      ).length,
    }))
    .filter((entry) => entry.count > 0);

  return {
    pricing: { flagged, counts },
    // Not for sale or not, it's still on the list to order.
    gone: rows.filter((row) => row.supplierRemoved),
  };
}

export async function getAttention(): Promise<Attention> {
  const now = new Date();
  const [open, orders, { pricing, gone }, catalog, documents] =
    await Promise.all([
      getOpenEntries(),
      getOrderAttention(),
      getPricingAttention(),
      getSyncStatus("catalog"),
      getSyncStatus("documents"),
    ]);

  const dueSoon = open.entries.filter(
    (entry) => entry.daysUntilDue != null && entry.daysUntilDue <= DUE_SOON_DAYS
  );

  return {
    payments: {
      overdue: open.entries.filter((entry) => entry.daysOverdue),
      overdueTotal: open.overdue,
      dueSoon,
      dueSoonTotal: dueSoon.reduce(
        (sum, entry) => sum + (entry.remainingAmount ?? 0),
        0
      ),
    },
    orders,
    pricing,
    gone,
    imports: {
      catalog: importHealth(catalog, now),
      documents: importHealth(documents, now),
    },
  };
}
