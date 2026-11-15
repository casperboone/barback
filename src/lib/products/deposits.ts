// What we have paid deposit ("emballage") on and not handed back yet, from the
// deposit lines on invoices and credit notes.
//
// An invoice charges deposit with a positive quantity and refunds what we
// returned with a negative one. A credit note refunds with a positive quantity;
// a negative one there takes a refund back, so it counts as charged.
// Everything is relative to the first imported document: whatever was out
// before that is unknown, so a type can come out below zero.
import {
  bucketQuantities,
  type Granularity,
  type QuantityRange,
} from "@/lib/items/quantity-history";

export type DepositLine = {
  documentNo: string;
  documentType: "invoice" | "creditmemo";
  // The document's calendar day in Amsterdam, like "2026-11-14".
  day: string;
  itemNo: string;
  description: string | null;
  quantity: number;
  unitPrice: number | null;
  amount: number;
};

export type DepositKind = "keg" | "co2" | "crate" | "can" | "bottle" | "other";

// In the order the page shows them: the expensive ones first. Cans go back
// to Statiegeld Nederland, which refunds them directly, so Rust never owes
// that deposit back and it stays out of the balance.
export const DEPOSIT_KINDS: {
  kind: DepositKind;
  label: string;
  returnedTo?: string;
}[] = [
  { kind: "keg", label: "Kegs" },
  { kind: "co2", label: "CO₂ cylinders" },
  { kind: "crate", label: "Crates" },
  { kind: "can", label: "Cans", returnedTo: "Statiegeld Nederland" },
  { kind: "bottle", label: "Bottles" },
  { kind: "other", label: "Other" },
];

const RETURNED_ELSEWHERE = new Set(
  DEPOSIT_KINDS.filter((kind) => kind.returnedTo).map((kind) => kind.kind),
);

// Rust's descriptions only say the amount ("EMBALLAGE EURO 30,00"), so what
// each item number stands for comes from the product line it follows on the
// invoices. Anything not listed lands under Other with its price.
const DEPOSIT_ITEMS: Record<string, { kind: DepositKind; name: string }> = {
  "8856": { kind: "keg", name: "Beer keg" },
  "8859": { kind: "keg", name: "Speciality beer keg" },
  "8820": { kind: "co2", name: "CO₂ cylinder" },
  // 24 bottles at € 0,10 in a € 1,50 crate.
  "8886": { kind: "crate", name: "Beer crate" },
  "8881": { kind: "crate", name: "Empty beer crate" },
  "8891": { kind: "crate", name: "Soft drink crate" },
  "8890": { kind: "crate", name: "Water crate, 6 × 75 cl" },
  "8825": { kind: "crate", name: "Cider crate" },
  "8887": { kind: "can", name: "Tray of 12 cans" },
  "8873": { kind: "can", name: "Tray of 24 cans" },
  "8852": { kind: "bottle", name: "Bottle" },
  "8822": { kind: "bottle", name: "Large bottle" },
};

export type DepositCounts = {
  charged: number;
  returned: number;
  // Charged less returned; below zero when more came back than we were
  // charged for since the first document.
  out: number;
  // What the deposit out is worth, excluding VAT.
  balance: number;
};

export type DepositRow = DepositCounts & {
  itemNo: string;
  kind: DepositKind;
  // Null for an item number we don't know, which the page names by price.
  name: string | null;
  unitPrice: number | null;
  lastDay: string;
};

export type DepositGroup = DepositCounts & {
  kind: DepositKind;
  label: string;
  // Who refunds this deposit when it isn't Rust; such a group is left out of
  // the balance.
  returnedTo: string | null;
  rows: DepositRow[];
};

export type DepositSummary = {
  groups: DepositGroup[];
  // Units of different things don't add up, so the total is money only, and
  // only what Rust owes back.
  balance: number;
};

const roundUnits = (value: number) => Math.round(value * 1000) / 1000;
const roundCents = (value: number) => Math.round(value * 100) / 100;

// Into the deposit itself: a refund taken back on a credit note is a charge.
function direction(line: DepositLine) {
  const charged = line.documentType === "invoice" ? line.quantity > 0 : line.quantity < 0;
  return { charged, units: Math.abs(line.quantity) };
}

// Whether Rust is the one to refund it, so it belongs in the balance.
function owedByRust(line: DepositLine) {
  const kind = DEPOSIT_ITEMS[line.itemNo]?.kind ?? "other";
  return !RETURNED_ELSEWHERE.has(kind);
}

function signedAmount(line: DepositLine) {
  return line.documentType === "creditmemo" ? -line.amount : line.amount;
}

function emptyCounts(): DepositCounts {
  return { charged: 0, returned: 0, out: 0, balance: 0 };
}

function rounded<T extends DepositCounts>(counts: T): T {
  return {
    ...counts,
    charged: roundUnits(counts.charged),
    returned: roundUnits(counts.returned),
    out: roundUnits(counts.charged - counts.returned),
    balance: roundCents(counts.balance),
  };
}

export function summarizeDeposits(lines: DepositLine[]): DepositSummary {
  const rows = new Map<string, DepositRow>();
  for (const line of lines) {
    const known = DEPOSIT_ITEMS[line.itemNo];
    const row = rows.get(line.itemNo) ?? {
      itemNo: line.itemNo,
      kind: known?.kind ?? "other",
      name: known?.name ?? null,
      unitPrice: line.unitPrice,
      lastDay: line.day,
      ...emptyCounts(),
    };
    const { charged, units } = direction(line);
    if (charged) row.charged += units;
    else row.returned += units;
    row.balance += signedAmount(line);
    if (line.day >= row.lastDay) {
      row.lastDay = line.day;
      // The newest price, in case it ever changes.
      row.unitPrice = line.unitPrice ?? row.unitPrice;
    }
    rows.set(line.itemNo, row);
  }

  const groups = DEPOSIT_KINDS.flatMap(({ kind, label, returnedTo }) => {
    const members = [...rows.values()]
      .filter((row) => row.kind === kind)
      .map(rounded)
      // The ones that matter most first, the leftovers of a one-off return last.
      .sort(
        (a, b) =>
          Math.abs(b.balance) - Math.abs(a.balance) ||
          b.charged + b.returned - (a.charged + a.returned) ||
          a.itemNo.localeCompare(b.itemNo),
      );
    if (members.length === 0) return [];
    const totals = members.reduce((sum, row) => {
      sum.charged += row.charged;
      sum.returned += row.returned;
      sum.balance += row.balance;
      return sum;
    }, emptyCounts());
    return [
      rounded({ kind, label, returnedTo: returnedTo ?? null, rows: members, ...totals }),
    ];
  });

  return {
    groups,
    balance: roundCents(
      groups
        .filter((group) => group.returnedTo == null)
        .reduce((sum, group) => sum + group.balance, 0),
    ),
  };
}

export type BalanceBucket = {
  start: string;
  label: string;
  title: string;
  // What moved in this period, and where the balance stood at its end.
  change: number;
  balance: number;
};

// The money balance at the end of each period, for the chart, leaving out
// what another party refunds. A range that
// starts later carries everything before it as its opening balance.
export function depositBalanceHistory(
  lines: DepositLine[],
  range: QuantityRange,
  granularity: Granularity,
  today: string,
): BalanceBucket[] {
  const points = lines.filter(owedByRust).map((line) => ({
    day: line.day,
    quantity: signedAmount(line),
    documentNo: line.documentNo,
  }));
  const buckets = bucketQuantities(points, range, granularity, today);
  const start = buckets[0]?.start;
  let balance = points
    .filter((point) => start != null && point.day < start)
    .reduce((sum, point) => sum + point.quantity, 0);
  return buckets.map((bucket) => {
    balance += bucket.quantity;
    return {
      start: bucket.start,
      label: bucket.label,
      title: bucket.title,
      change: roundCents(bucket.quantity),
      balance: roundCents(balance),
    };
  });
}

// The calendar years with deposit lines, newest first, for the year filter.
export function depositYears(lines: DepositLine[]): number[] {
  const years = new Set(lines.map((line) => Number(line.day.slice(0, 4))));
  return [...years].sort((a, b) => b - a);
}

// Just one year, which then starts from nothing: deposit charged before it
// and returned during it comes out below zero.
export function linesInYear(lines: DepositLine[], year: number): DepositLine[] {
  const prefix = `${year}-`;
  return lines.filter((line) => line.day.startsWith(prefix));
}
