import { db } from "@/db";
import { attentionAcknowledgements } from "@/db/schema";
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

// What the attention page lists: everything worth doing something about,
// gathered from the screens that have the details. Each part comes from the
// same query or signal as its own screen, so the counts agree.

// An import that hasn't succeeded for this long is out of date. Documents go
// stale sooner, because orders and payments are followed with them.
export const STALE_AFTER_DAYS: Record<ImportKind, number> = {
  catalog: 7,
  documents: 3,
};

// Unpaid invoices due within this many days are worth paying now.
export const DUE_SOON_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

// What a case is about (`key`) and the state it is in (`fingerprint`). It
// counts as acknowledged while the fingerprint is the one it was acknowledged
// with, so a case comes back once it changes.
export type Ack = {
  key: string;
  fingerprint: string;
  acknowledgedAt: Date | null;
};

export type Acked<T> = T & { ack: Ack };

export function isOpen(item: { ack: Ack }) {
  return item.ack.acknowledgedAt === null;
}

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
    overdue: Acked<OpenEntry>[];
    dueSoon: Acked<OpenEntry>[];
  };
  orders: {
    notDelivered: Acked<NotDeliveredLine>[];
    // Sent over two weeks ago, and no invoice yet.
    noInvoice: Acked<OrderRef>[];
    // Rust's documents that look like they're the order's, to link or turn down.
    toLink: Acked<OrderRef & { count: number }>[];
    // Invoiced, with lines the matching can't follow, to tick off by hand.
    toTick: Acked<OrderRef & { count: number }>[];
  };
  // For-sale items the pricing screen flags, worst first.
  pricing: Acked<FlaggedItem>[];
  // Items on our list whose product Rust no longer lists.
  gone: Acked<PricingRow>[];
  // Only the imports with something wrong.
  imports: Acked<ImportHealth>[];
  // Both, for saying how recent they are when nothing is wrong.
  syncs: Record<ImportKind, ImportHealth>;
};

function importHealth(status: SyncStatus, now: Date): ImportHealth {
  const { kind, latest, lastSuccess, running } = status;
  const finishedAt = lastSuccess?.finishedAt;
  const stale =
    !finishedAt ||
    now.getTime() - finishedAt.getTime() > STALE_AFTER_DAYS[kind] * DAY_MS;
  const failed = !running && !!latest && latest.status !== "succeeded";
  const unfinished = !running && !failed && !!lastSuccess?.remainingCount;
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

async function getOrderAttention() {
  const tracked = await getTrackedOrders();
  const { lines, overdue } = findNotDelivered(tracked);

  // Unlikely suggestions only share a product; the order page still shows
  // them, but they're no reason to go there.
  const suggestions = await Promise.all(
    tracked.map(async (row) => ({
      order: row.order,
      documents: (await getSuggestions(row))
        .filter((suggestion) => suggestion.confidence !== "low")
        .map((suggestion) => suggestion.documentNo),
    }))
  );

  return {
    notDelivered: lines,
    noInvoice: overdue,
    toLink: suggestions
      .filter((row) => row.documents.length > 0)
      .map((row) => ({
        ...orderRef(row.order),
        count: row.documents.length,
        documents: row.documents,
      })),
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

  return {
    flagged,
    // Not for sale or not, it's still on the list to order.
    gone: rows.filter((row) => row.supplierRemoved),
  };
}

// How many items carry each kind of flag, for the ones still open.
export function countFlags(flagged: FlaggedItem[]) {
  return (Object.keys(SIGNAL_NAMES) as SignalKey[])
    .map((key) => ({
      key,
      name: SIGNAL_NAMES[key],
      count: flagged.filter((item) =>
        item.chips.some((chip) => chip.key === key)
      ).length,
    }))
    .filter((entry) => entry.count > 0);
}

function importProblem(health: ImportHealth) {
  if (health.failed) return "failed";
  if (health.unfinished) return "unfinished";
  return "stale";
}

export async function getAttention(): Promise<Attention> {
  const now = new Date();
  const [open, orders, { flagged, gone }, catalog, documents, acks] =
    await Promise.all([
      getOpenEntries(),
      getOrderAttention(),
      getPricingAttention(),
      getSyncStatus("catalog"),
      getSyncStatus("documents"),
      db.select().from(attentionAcknowledgements),
    ]);

  const syncs = {
    catalog: importHealth(catalog, now),
    documents: importHealth(documents, now),
  };
  const byKey = new Map(acks.map((row) => [row.key, row]));
  const mark = <T extends object>(
    item: T,
    key: string,
    fingerprint: string
  ): Acked<T> => {
    const saved = byKey.get(key);
    return {
      ...item,
      ack: {
        key,
        fingerprint,
        acknowledgedAt:
          saved?.fingerprint === fingerprint ? saved.acknowledgedAt : null,
      },
    };
  };

  // Acknowledging that something is due soon doesn't cover it being late, and
  // neither covers another amount.
  const payment = (entry: OpenEntry, state: string) =>
    mark(
      entry,
      `payment:${entry.documentNo}`,
      `${state}:${entry.remainingAmount}`
    );

  return {
    payments: {
      overdue: open.entries
        .filter((entry) => entry.daysOverdue)
        .map((entry) => payment(entry, "overdue")),
      dueSoon: open.entries
        .filter(
          (entry) =>
            entry.daysUntilDue != null && entry.daysUntilDue <= DUE_SOON_DAYS
        )
        .map((entry) => payment(entry, "due-soon")),
    },
    orders: {
      notDelivered: orders.notDelivered.map((row) =>
        mark(row, `line:${row.line.id}`, `${row.status}:${row.shortBy}`)
      ),
      noInvoice: orders.noInvoice.map((order) =>
        mark(order, `no-invoice:${order.id}`, "no-invoice")
      ),
      // Another document turning up is worth a look again.
      toLink: orders.toLink.map(({ documents, ...order }) =>
        mark(order, `to-link:${order.id}`, [...documents].sort().join(","))
      ),
      toTick: orders.toTick.map((order) =>
        mark(order, `to-tick:${order.id}`, String(order.count))
      ),
    },
    // The chips carry the amounts, so a price or cost that moves again shows.
    pricing: flagged.map((item) =>
      mark(
        item,
        `pricing:${item.row.id}`,
        item.chips.map((chip) => `${chip.label}: ${chip.detail}`).join("|")
      )
    ),
    gone: gone.map((row) => mark(row, `gone:${row.id}`, row.itemNo ?? "")),
    // Until the next run, whatever it brings.
    imports: [syncs.catalog, syncs.documents]
      .filter((health) => health.needsAttention)
      .map((health) =>
        mark(
          health,
          `import:${health.kind}`,
          `${importProblem(health)}:${health.latest?.id ?? "none"}`
        )
      ),
    syncs,
  };
}
