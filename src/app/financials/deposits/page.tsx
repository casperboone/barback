import {
  BeerIcon,
  CircleHelpIcon,
  CupSodaIcon,
  CylinderIcon,
  MilkIcon,
  PackageIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatNumber, formatPrice, formatShortDate } from "@/lib/format";
import {
  defaultGranularity,
  toDay,
  type QuantityRange,
} from "@/lib/items/quantity-history";
import { getDepositLines } from "@/lib/products/deposit-lines";
import {
  depositBalanceHistory,
  summarizeDeposits,
  type DepositCounts,
  type DepositKind,
  type DepositRow,
} from "@/lib/products/deposits";
import { cn } from "@/lib/utils";
import { BalanceChart, type BalanceHistory } from "./balance-chart";

export const dynamic = "force-dynamic";

// The layout's invoice import runs as a server action from this page, and
// maxDuration applies per page, so it gets the platform maximum here too.
export const maxDuration = 60;
export const metadata = { title: "Deposits · Inventory Manager" };

const ICONS: Record<DepositKind, LucideIcon> = {
  keg: BeerIcon,
  co2: CylinderIcon,
  crate: PackageIcon,
  can: CupSodaIcon,
  bottle: MilkIcon,
  other: CircleHelpIcon,
};

const RANGES: { key: string; label: string; range: QuantityRange }[] = [
  { key: "all", label: "All", range: { kind: "all" } },
  { key: "3y", label: "3 years", range: { kind: "rolling", months: 36 } },
  { key: "12m", label: "12 months", range: { kind: "rolling", months: 12 } },
];

// A calendar day as a date, at noon so it's the same day in Amsterdam.
function fromDay(day: string) {
  return new Date(`${day}T12:00:00Z`);
}

function rowName(row: DepositRow) {
  return row.name ?? `Deposit of ${formatPrice(row.unitPrice)}`;
}

// Below zero means more came back than we were charged for in the documents
// we have, which is a fact about the window rather than a debt.
function Out({ counts, className }: { counts: DepositCounts; className?: string }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        counts.out < 0 && "text-muted-foreground",
        className,
      )}
    >
      {counts.out < 0 && "−"}
      {formatNumber(Math.abs(counts.out), 1)}
    </span>
  );
}

export default async function DepositsPage() {
  const { lines, since } = await getDepositLines();
  const { groups, balance } = summarizeDeposits(lines);
  const today = toDay(new Date());
  const firstDay = lines[0]?.day ?? null;
  const histories: BalanceHistory[] = RANGES.map(({ key, label, range }) => {
    const granularity = defaultGranularity(range, today, firstDay);
    return {
      key,
      label,
      granularity,
      buckets: depositBalanceHistory(lines, range, granularity, today),
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Deposits</h1>
        <p className="text-sm text-muted-foreground">
          The kegs, crates and bottles we paid deposit (&ldquo;emballage&rdquo;)
          on and haven&apos;t handed back yet, from the invoices and credit
          notes. Counted from the first imported document
          {since && <> ({formatDate(since)})</>}: whatever was out before that
          is unknown, so a type can come out below zero. Open orders
          aren&apos;t included until they are invoiced. Amounts exclude VAT.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div className="rounded-lg border bg-background p-4 sm:col-span-3 lg:col-span-1 lg:row-span-2 lg:flex lg:flex-col lg:justify-center">
          <p className="text-xs text-muted-foreground">Deposit out</p>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {formatPrice(balance)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Paid to Rust and still to come back
          </p>
        </div>
        {groups.map((group) => {
          const Icon = ICONS[group.kind];
          return (
            <div
              key={group.kind}
              className="flex items-start gap-3 rounded-lg border bg-background p-4"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                <Icon className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{group.label}</p>
                <p className="text-2xl font-semibold">
                  <Out counts={group} />
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    out
                  </span>
                </p>
                <p
                  className={cn(
                    "text-xs tabular-nums",
                    group.balance < 0 ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {formatPrice(group.balance)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-lg border bg-background">
        <header className="border-b bg-muted/50 px-3 py-2">
          <h2 className="text-sm font-semibold">Balance over time</h2>
        </header>
        <div className="p-3">
          <BalanceChart histories={histories} />
        </div>
      </section>

      <div className="overflow-hidden rounded-lg border bg-background">
        <Table className="text-xs [&_td]:px-1.5 [&_th]:px-1.5 sm:text-sm sm:[&_td]:px-2 sm:[&_th]:px-2">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Deposit</TableHead>
              <TableHead className="hidden w-20 text-right sm:table-cell">
                Charged
              </TableHead>
              <TableHead className="hidden w-20 text-right sm:table-cell">
                Returned
              </TableHead>
              <TableHead className="w-14 text-right sm:w-20">Out</TableHead>
              <TableHead className="w-24 text-right">Balance</TableHead>
              <TableHead className="w-20 text-right sm:w-24">Last</TableHead>
            </TableRow>
          </TableHeader>
          {groups.length === 0 && (
            <TableBody>
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No deposit lines yet. Import the documents to fill this in.
                </TableCell>
              </TableRow>
            </TableBody>
          )}
          {groups.map((group) => (
            <TableBody key={group.kind} className="border-t first:border-t-0">
              <TableRow className="bg-muted/30 font-medium hover:bg-muted/30">
                <TableCell>{group.label}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {formatNumber(group.charged, 1)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {formatNumber(group.returned, 1)}
                </TableCell>
                <TableCell className="text-right">
                  <Out counts={group} />
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    group.balance < 0 && "text-muted-foreground",
                  )}
                >
                  {formatPrice(group.balance)}
                </TableCell>
                <TableCell />
              </TableRow>
              {group.rows.map((row) => (
                <TableRow key={row.itemNo}>
                  <TableCell className="pl-4 sm:pl-6">
                    <div>{rowName(row)}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{row.itemNo}</span>
                      {row.name && <> · {formatPrice(row.unitPrice)} each</>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {formatNumber(row.charged, 1)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {formatNumber(row.returned, 1)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Out counts={row} />
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      row.balance < 0 && "text-muted-foreground",
                    )}
                  >
                    {formatPrice(row.balance)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                    <span className="sm:hidden">
                      {formatShortDate(fromDay(row.lastDay))}
                    </span>
                    <span className="hidden sm:inline">
                      {formatDate(fromDay(row.lastDay))}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          ))}
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        A credit note counts as a return, the way Rust refunds a pile of kegs
        at once. What an item number stands for comes from the products it
        follows on the invoices; Rust only calls them &ldquo;EMBALLAGE&rdquo;
        with an amount.
      </p>
    </div>
  );
}
