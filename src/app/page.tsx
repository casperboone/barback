import { Fragment } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { ImportButton } from "@/components/import-button";
import { SyncStatusLine } from "@/components/sync-status-line";
import {
  getAttention,
  type Attention,
  type ImportHealth,
} from "@/lib/attention/queries";
import { formatAge, formatDate, formatNumber, formatPrice } from "@/lib/format";
import { orderLabel } from "@/lib/orders/reference";
import type { ImportKind } from "@/lib/supplier/import-runs";
import { cn } from "@/lib/utils";
import {
  AttentionCard,
  AttentionRow,
  FineList,
  MAX_ROWS,
  TONE_TEXT,
  type Tone,
} from "./attention-card";

// Always read the database at request time instead of prerendering at build.
export const dynamic = "force-dynamic";

// A stale import can be started from here, as a server action, and
// maxDuration applies per page.
export const maxDuration = 60;

export const metadata = { title: "Needs attention · Inventory Manager" };

const plural = (count: number, one: string, many = `${one}s`) =>
  `${formatNumber(count)} ${count === 1 ? one : many}`;

const joined = (parts: (string | false)[]) => parts.filter(Boolean).join(" · ");

type Card = { key: string; node: React.ReactNode };
type Fine = { key: string; title: string; detail: string; href: string };

const IMPORT_TITLES: Record<ImportKind, string> = {
  catalog: "Catalog",
  documents: "Documents",
};

function invoiceHref(documentNo: string) {
  return `/financials/invoices/${encodeURIComponent(documentNo)}`;
}

function PaymentsCard({ payments }: { payments: Attention["payments"] }) {
  const { overdue, overdueTotal, dueSoon, dueSoonTotal } = payments;
  const entries = [...overdue, ...dueSoon];
  return (
    <AttentionCard
      title="Payments"
      count={entries.length}
      tone={overdue.length > 0 ? "bad" : "warn"}
      href="/financials/outstanding"
      summary={joined([
        overdue.length > 0 && `${formatPrice(overdueTotal)} past its due date`,
        dueSoon.length > 0 && `${formatPrice(dueSoonTotal)} due within a week`,
      ]) + ", including VAT."}
      more={entries.length - MAX_ROWS}
    >
      {entries.slice(0, MAX_ROWS).map((entry) => (
        <AttentionRow
          key={entry.documentNo}
          href={invoiceHref(entry.documentNo)}
          title={<span className="font-mono">{entry.documentNo}</span>}
          meta={<span>Due {formatDate(entry.dueDate)}</span>}
          aside={
            <>
              <div className="font-medium">
                {formatPrice(entry.remainingAmount)}
              </div>
              {entry.daysOverdue ? (
                <div className={cn("text-xs font-medium", TONE_TEXT.bad)}>
                  {entry.daysOverdue}d late
                </div>
              ) : (
                <div className={cn("text-xs", TONE_TEXT.warn)}>
                  {entry.daysUntilDue === 0
                    ? "Due today"
                    : `In ${plural(entry.daysUntilDue ?? 0, "day")}`}
                </div>
              )}
            </>
          }
        />
      ))}
    </AttentionCard>
  );
}

function OrdersCard({ orders }: { orders: Attention["orders"] }) {
  const { notDelivered, noInvoice, toLink, toTick } = orders;
  const rows = [
    ...notDelivered.map((row) => (
      <AttentionRow
        key={`line-${row.line.id}`}
        href={`/orders/${row.order.id}`}
        title={row.line.name}
        meta={
          <>
            <span>{orderLabel(row.order)}</span>
            <span>Sent {formatDate(row.order.sentAt)}</span>
          </>
        }
        aside={
          <>
            <div className="font-medium">
              {formatNumber(row.got)} / {formatNumber(row.line.quantity)}
            </div>
            <div className={cn("text-xs font-medium", TONE_TEXT.bad)}>
              {row.status === "missing" ? "Missing" : "Short"}
            </div>
          </>
        }
      />
    )),
    ...noInvoice.map((order) => (
      <AttentionRow
        key={`invoice-${order.id}`}
        href={`/orders/${order.id}`}
        title={orderLabel(order)}
        meta={<span>Sent {formatDate(order.sentAt)}</span>}
        aside={<span className={TONE_TEXT.warn}>No invoice yet</span>}
      />
    )),
    ...toLink.map((order) => (
      <AttentionRow
        key={`link-${order.id}`}
        href={`/orders/${order.id}`}
        title={orderLabel(order)}
        meta={<span>Sent {formatDate(order.sentAt)}</span>}
        aside={
          <span className={TONE_TEXT.warn}>
            {plural(order.count, "document")} to link
          </span>
        }
      />
    )),
    ...toTick.map((order) => (
      <AttentionRow
        key={`tick-${order.id}`}
        href={`/orders/${order.id}`}
        title={orderLabel(order)}
        meta={<span>Sent {formatDate(order.sentAt)}</span>}
        aside={
          <span className={TONE_TEXT.warn}>
            {plural(order.count, "line")} to tick off
          </span>
        }
      />
    )),
  ];

  return (
    <AttentionCard
      title="Orders"
      count={rows.length}
      tone={notDelivered.length > 0 ? "bad" : "warn"}
      href={
        notDelivered.length > 0 || noInvoice.length > 0
          ? "/orders/not-delivered"
          : "/orders"
      }
      summary={joined([
        notDelivered.length > 0 &&
          `${plural(notDelivered.length, "line")} not delivered`,
        noInvoice.length > 0 &&
          `${plural(noInvoice.length, "order")} without an invoice two weeks after sending`,
        toLink.length > 0 &&
          `${plural(toLink.length, "order")} with documents to link or turn down`,
        toTick.length > 0 &&
          `${plural(toTick.length, "order")} with lines to tick off`,
      ])}
      more={rows.length - MAX_ROWS}
    >
      {rows.slice(0, MAX_ROWS)}
    </AttentionCard>
  );
}

function PricingCard({ pricing }: { pricing: Attention["pricing"] }) {
  const { flagged, counts } = pricing;
  const tone: Tone = flagged.some((item) =>
    item.chips.some((chip) => chip.tone === "bad")
  )
    ? "bad"
    : "warn";
  return (
    <AttentionCard
      title="Pricing"
      count={flagged.length}
      tone={tone}
      href="/pricing?view=attention"
      summary={`${joined(
        counts.map((entry) => `${formatNumber(entry.count)} ${entry.name}`)
      )}.`}
      more={flagged.length - MAX_ROWS}
    >
      {flagged.slice(0, MAX_ROWS).map(({ row, chips }) => (
        <AttentionRow
          key={row.id}
          href={`/items/${row.id}`}
          title={row.name}
          meta={chips.map((chip) => (
            <span key={chip.key} className={TONE_TEXT[chip.tone]}>
              {chip.label}
            </span>
          ))}
        />
      ))}
    </AttentionCard>
  );
}

function GoneCard({ gone }: { gone: Attention["gone"] }) {
  return (
    <AttentionCard
      title="Gone from Rust's catalog"
      count={gone.length}
      tone="bad"
      href={gone.length === 1 ? `/order-list?item=${gone[0].id}` : "/order-list"}
      summary="On our list, but Rust no longer sells the product. Link the item to another product, or archive it."
      more={gone.length - MAX_ROWS}
    >
      {gone.slice(0, MAX_ROWS).map((row) => (
        <AttentionRow
          key={row.id}
          href={`/order-list?item=${row.id}`}
          title={row.name}
          meta={
            <>
              {row.itemNo && <span>{row.itemNo}</span>}
              {row.supplierDescription && (
                <span className="line-through">{row.supplierDescription}</span>
              )}
            </>
          }
        />
      ))}
    </AttentionCard>
  );
}

function importProblem(health: ImportHealth) {
  const { lastSuccess } = health;
  if (health.failed) return "The latest import failed";
  if (health.unfinished) {
    return `${plural(lastSuccess?.remainingCount ?? 0, "document")} still to read`;
  }
  if (!lastSuccess?.finishedAt) return "Never imported";
  return `Synced ${formatAge(lastSuccess.finishedAt)}`;
}

function ImportsCard({ imports }: { imports: Attention["imports"] }) {
  const all = [imports.catalog, imports.documents];
  const needing = all.filter((health) => health.needsAttention);
  return (
    <AttentionCard
      title="Imports"
      count={needing.length}
      tone={needing.some((health) => health.failed) ? "bad" : "warn"}
      href="/imports"
      summary="What the other screens know about Rust is only as recent as the last import."
    >
      {all.map((health) => (
        <li
          key={health.kind}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
        >
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">
              {IMPORT_TITLES[health.kind]}
              {health.needsAttention && (
                <span
                  className={cn(
                    "font-normal",
                    TONE_TEXT[health.failed ? "bad" : "warn"]
                  )}
                >
                  {" · "}
                  {importProblem(health)}
                </span>
              )}
            </div>
            <SyncStatusLine status={health} className="text-xs" />
          </div>
          {health.needsAttention && (
            <ImportButton kind={health.kind} running={health.running} compact />
          )}
        </li>
      ))}
    </AttentionCard>
  );
}

function importAge(health: ImportHealth) {
  if (health.running) return "syncing";
  const finishedAt = health.lastSuccess?.finishedAt;
  return finishedAt ? formatAge(finishedAt) : "never";
}

export default async function HomePage() {
  const attention = await getAttention();
  const { payments, orders, pricing, gone, imports } = attention;
  const cards: Card[] = [];
  const fine: Fine[] = [];

  // Always in this order, so each thing has its place on the screen.
  if (payments.overdue.length + payments.dueSoon.length > 0) {
    cards.push({ key: "payments", node: <PaymentsCard payments={payments} /> });
  } else {
    fine.push({
      key: "payments",
      title: "Payments",
      detail: "Nothing overdue or due this week",
      href: "/financials/outstanding",
    });
  }

  const orderCount =
    orders.notDelivered.length +
    orders.noInvoice.length +
    orders.toLink.length +
    orders.toTick.length;
  if (orderCount > 0) {
    cards.push({ key: "orders", node: <OrdersCard orders={orders} /> });
  } else {
    fine.push({
      key: "orders",
      title: "Orders",
      detail: "Nothing missing as far as Rust has told us",
      href: "/orders",
    });
  }

  if (pricing.flagged.length > 0) {
    cards.push({ key: "pricing", node: <PricingCard pricing={pricing} /> });
  } else {
    fine.push({
      key: "pricing",
      title: "Pricing",
      detail: "No prices flagged",
      href: "/pricing",
    });
  }

  if (gone.length > 0) {
    cards.push({ key: "gone", node: <GoneCard gone={gone} /> });
  } else {
    fine.push({
      key: "gone",
      title: "Catalog",
      detail: "Rust still sells everything on our list",
      href: "/order-list",
    });
  }

  if (imports.catalog.needsAttention || imports.documents.needsAttention) {
    cards.push({ key: "imports", node: <ImportsCard imports={imports} /> });
  } else {
    fine.push({
      key: "imports",
      title: "Imports",
      detail: `Catalog ${importAge(imports.catalog)}, documents ${importAge(imports.documents)}`,
      href: "/imports",
    });
  }

  return (
    <div className="space-y-4 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Needs attention
        </h1>
        <p className="text-sm text-muted-foreground">
          What&apos;s worth doing something about, from all the other screens.
          Tap through for the details.
        </p>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-8 text-center dark:border-emerald-500/40 dark:bg-emerald-500/10">
          <CheckCircle2Icon className="mx-auto size-8 text-emerald-600 dark:text-emerald-400" />
          <p className="mt-2 text-lg font-semibold">All clear</p>
          <p className="text-sm text-muted-foreground">
            Nothing overdue, missing or flagged, and Rust&apos;s data is up to
            date.
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <Fragment key={card.key}>{card.node}</Fragment>
          ))}
        </div>
      )}

      <FineList items={fine} />
    </div>
  );
}
