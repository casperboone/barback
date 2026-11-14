import { Fragment } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { ImportButton } from "@/components/import-button";
import { SyncStatusLine } from "@/components/sync-status-line";
import {
  countFlags,
  getAttention,
  isOpen,
  type Ack,
  type Acked,
  type Attention,
  type ImportHealth,
  type OrderRef,
} from "@/lib/attention/queries";
import { formatAge, formatDate, formatNumber, formatPrice } from "@/lib/format";
import { orderLabel } from "@/lib/orders/reference";
import type { OpenEntry } from "@/lib/products/open-entries";
import type { ImportKind } from "@/lib/supplier/import-runs";
import { cn } from "@/lib/utils";
import { AckButton } from "./ack-button";
import {
  AcknowledgedList,
  AttentionCard,
  AttentionRow,
  FineList,
  TONE_TEXT,
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

const IMPORT_TITLES: Record<ImportKind, string> = {
  catalog: "Catalog",
  documents: "Documents",
};

// One case as a row, the same whether it is open or acknowledged.
type Row = {
  ack: Ack;
  // For screen readers, and the toast when it goes wrong.
  label: string;
  href: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  aside?: React.ReactNode;
};

function renderRow(row: Row) {
  const { acknowledgedAt } = row.ack;
  return (
    <AttentionRow
      key={row.ack.key}
      href={row.href}
      title={row.title}
      meta={
        acknowledgedAt ? (
          <>
            {row.meta}
            <span>Acknowledged {formatDate(acknowledgedAt)}</span>
          </>
        ) : (
          row.meta
        )
      }
      aside={row.aside}
      muted={!!acknowledgedAt}
      action={<AckButton ack={row.ack} label={row.label} />}
    />
  );
}

// Splits a section's rows into what still counts and what was acknowledged.
function split<T extends { ack: Ack }>(items: T[], toRow: (item: T) => Row) {
  return {
    open: items.filter(isOpen),
    rows: items.filter(isOpen).map(toRow),
    acknowledged: items.filter((item) => !isOpen(item)).map(toRow),
  };
}

const sum = (entries: OpenEntry[]) =>
  entries.reduce((total, entry) => total + (entry.remainingAmount ?? 0), 0);

function paymentRow(entry: Acked<OpenEntry>): Row {
  return {
    ack: entry.ack,
    label: entry.documentNo,
    href: `/financials/invoices/${encodeURIComponent(entry.documentNo)}`,
    title: <span className="font-mono">{entry.documentNo}</span>,
    meta: <span>Due {formatDate(entry.dueDate)}</span>,
    aside: (
      <>
        <div className="font-medium">{formatPrice(entry.remainingAmount)}</div>
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
    ),
  };
}

function orderMeta(order: { sentAt: Date | null }) {
  return <span>Sent {formatDate(order.sentAt)}</span>;
}

type Section = {
  key: string;
  card?: React.ReactNode;
  acknowledged: React.ReactNode[];
  fine: { title: string; detail: string; href: string };
};

function paymentsSection({ overdue, dueSoon }: Attention["payments"]): Section {
  const late = split(overdue, paymentRow);
  const soon = split(dueSoon, paymentRow);
  const rows = [...late.rows, ...soon.rows];
  return {
    key: "payments",
    card: rows.length > 0 && (
      <AttentionCard
        title="Payments"
        tone={late.rows.length > 0 ? "bad" : "warn"}
        href="/financials/outstanding"
        summary={
          joined([
            late.open.length > 0 &&
              `${formatPrice(sum(late.open))} past its due date`,
            soon.open.length > 0 &&
              `${formatPrice(sum(soon.open))} due within a week`,
          ]) + ", including VAT."
        }
        rows={rows.map(renderRow)}
      />
    ),
    acknowledged: [...late.acknowledged, ...soon.acknowledged].map(renderRow),
    fine: {
      title: "Payments",
      detail: "Nothing overdue or due this week",
      href: "/financials/outstanding",
    },
  };
}

function ordersSection(orders: Attention["orders"]): Section {
  const notDelivered = split(orders.notDelivered, (row) => ({
    ack: row.ack,
    label: row.line.name,
    href: `/orders/${row.order.id}`,
    title: row.line.name,
    meta: (
      <>
        <span>{orderLabel(row.order)}</span>
        {orderMeta(row.order)}
      </>
    ),
    aside: (
      <>
        <div className="font-medium">
          {formatNumber(row.got)} / {formatNumber(row.line.quantity)}
        </div>
        <div className={cn("text-xs font-medium", TONE_TEXT.bad)}>
          {row.status === "missing" ? "Missing" : "Short"}
        </div>
      </>
    ),
  }));
  const orderRow = (order: Acked<OrderRef>, aside: string): Row => ({
    ack: order.ack,
    label: `${orderLabel(order)}: ${aside}`,
    href: `/orders/${order.id}`,
    title: orderLabel(order),
    meta: orderMeta(order),
    aside: <span className={TONE_TEXT.warn}>{aside}</span>,
  });
  const noInvoice = split(orders.noInvoice, (order) =>
    orderRow(order, "No invoice yet")
  );
  const toLink = split(orders.toLink, (order) =>
    orderRow(order, `${plural(order.count, "document")} to link`)
  );
  const toTick = split(orders.toTick, (order) =>
    orderRow(order, `${plural(order.count, "line")} to tick off`)
  );
  const parts = [notDelivered, noInvoice, toLink, toTick];
  const rows = parts.flatMap((part) => part.rows);

  return {
    key: "orders",
    card: rows.length > 0 && (
      <AttentionCard
        title="Orders"
        tone={notDelivered.rows.length > 0 ? "bad" : "warn"}
        href={
          notDelivered.rows.length > 0 || noInvoice.rows.length > 0
            ? "/orders/not-delivered"
            : "/orders"
        }
        summary={joined([
          notDelivered.rows.length > 0 &&
            `${plural(notDelivered.rows.length, "line")} not delivered`,
          noInvoice.rows.length > 0 &&
            `${plural(noInvoice.rows.length, "order")} without an invoice two weeks after sending`,
          toLink.rows.length > 0 &&
            `${plural(toLink.rows.length, "order")} with documents to link or turn down`,
          toTick.rows.length > 0 &&
            `${plural(toTick.rows.length, "order")} with lines to tick off`,
        ])}
        rows={rows.map(renderRow)}
      />
    ),
    acknowledged: parts.flatMap((part) => part.acknowledged).map(renderRow),
    fine: {
      title: "Orders",
      detail: "Nothing missing as far as Rust has told us",
      href: "/orders",
    },
  };
}

function pricingSection(pricing: Attention["pricing"]): Section {
  const { open, rows, acknowledged } = split(pricing, ({ row, chips, ack }) => ({
    ack,
    label: row.name,
    href: `/items/${row.id}`,
    title: row.name,
    meta: chips.map((chip) => (
      <span key={chip.key} className={TONE_TEXT[chip.tone]}>
        {chip.label}
      </span>
    )),
  }));
  const bad = open.some((item) => item.chips.some((chip) => chip.tone === "bad"));
  return {
    key: "pricing",
    card: rows.length > 0 && (
      <AttentionCard
        title="Pricing"
        tone={bad ? "bad" : "warn"}
        href="/pricing?view=attention"
        summary={`${joined(
          countFlags(open).map(
            (entry) => `${formatNumber(entry.count)} ${entry.name}`
          )
        )}.`}
        rows={rows.map(renderRow)}
      />
    ),
    acknowledged: acknowledged.map(renderRow),
    fine: { title: "Pricing", detail: "No prices flagged", href: "/pricing" },
  };
}

function goneSection(gone: Attention["gone"]): Section {
  const { rows, acknowledged } = split(gone, (row) => ({
    ack: row.ack,
    label: row.name,
    href: `/order-list?item=${row.id}`,
    title: row.name,
    meta: (
      <>
        {row.itemNo && <span>{row.itemNo}</span>}
        {row.supplierDescription && (
          <span className="line-through">{row.supplierDescription}</span>
        )}
      </>
    ),
  }));
  return {
    key: "gone",
    card: rows.length > 0 && (
      <AttentionCard
        title="Gone from Rust's catalog"
        tone="bad"
        href="/order-list"
        summary="On our list, but Rust no longer sells the product. Link the item to another product, or archive it."
        rows={rows.map(renderRow)}
      />
    ),
    acknowledged: acknowledged.map(renderRow),
    fine: {
      title: "Catalog",
      detail: "Rust still sells everything on our list",
      href: "/order-list",
    },
  };
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

function importAge(health: ImportHealth) {
  if (health.running) return "syncing";
  const finishedAt = health.lastSuccess?.finishedAt;
  return finishedAt ? formatAge(finishedAt) : "never";
}

function importsSection(
  imports: Attention["imports"],
  ages: string
): Section {
  const { open, acknowledged } = split(imports, (health) => ({
    ack: health.ack,
    label: IMPORT_TITLES[health.kind],
    href: "/imports",
    title: IMPORT_TITLES[health.kind],
    meta: <span>{importProblem(health)}</span>,
  }));
  // The import button lives in the row, so these aren't links.
  const rows = open.map((health) => (
    <li key={health.kind} className="flex items-stretch">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">
            {IMPORT_TITLES[health.kind]}
            <span
              className={cn(
                "font-normal",
                TONE_TEXT[health.failed ? "bad" : "warn"]
              )}
            >
              {" · "}
              {importProblem(health)}
            </span>
          </div>
          <SyncStatusLine status={health} className="text-xs" />
        </div>
        <ImportButton kind={health.kind} running={health.running} compact />
      </div>
      <AckButton ack={health.ack} label={IMPORT_TITLES[health.kind]} />
    </li>
  ));
  return {
    key: "imports",
    card: rows.length > 0 && (
      <AttentionCard
        title="Imports"
        tone={open.some((health) => health.failed) ? "bad" : "warn"}
        href="/imports"
        summary="What the other screens know about Rust is only as recent as the last import."
        rows={rows}
      />
    ),
    acknowledged: acknowledged.map(renderRow),
    fine: { title: "Imports", detail: ages, href: "/imports" },
  };
}

export default async function AttentionPage() {
  const attention = await getAttention();
  const { catalog, documents } = attention.syncs;

  // Always in this order, so each thing has its place on the screen.
  const sections = [
    paymentsSection(attention.payments),
    ordersSection(attention.orders),
    pricingSection(attention.pricing),
    goneSection(attention.gone),
    importsSection(
      attention.imports,
      `Catalog ${importAge(catalog)}, documents ${importAge(documents)}`
    ),
  ];
  const cards = sections.filter((section) => section.card);
  const acknowledged = sections.flatMap((section) => section.acknowledged);

  return (
    <div className="space-y-4 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Needs attention
        </h1>
        <p className="text-sm text-muted-foreground">
          What&apos;s worth doing something about, from all the other screens.
          Tap a row for the details, or tick it off when you know about it and
          it can stay as it is; it comes back if it changes.
        </p>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-8 text-center dark:border-emerald-500/40 dark:bg-emerald-500/10">
          <CheckCircle2Icon className="mx-auto size-8 text-emerald-600 dark:text-emerald-400" />
          <p className="mt-2 text-lg font-semibold">All clear</p>
          <p className="text-sm text-muted-foreground">
            Nothing overdue, missing or flagged that you haven&apos;t seen, and
            Rust&apos;s data is up to date.
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {cards.map((section) => (
            <Fragment key={section.key}>{section.card}</Fragment>
          ))}
        </div>
      )}

      <FineList
        items={sections
          .filter((section) => !section.card)
          .map((section) => ({
            key: section.key,
            ...section.fine,
            detail:
              section.acknowledged.length > 0
                ? `${section.fine.detail} · ${formatNumber(section.acknowledged.length)} acknowledged`
                : section.fine.detail,
          }))}
      />

      <AcknowledgedList rows={acknowledged} />
    </div>
  );
}
