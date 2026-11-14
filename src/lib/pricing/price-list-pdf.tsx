import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  matchesSpecials,
  type SpecialsFilter,
} from "@/components/special-badge";
import { formatDate, formatPercent, formatPrice } from "@/lib/format";
import { priceTone } from "./calc";
import { pricesDiffer } from "./composite";
import type { PricingOverview, PricingRow } from "./queries";

// The price list as a printable PDF, in the order page's categories like the
// pricing screen. Plain on purpose: it's for reading prices off, not for show.
// `details` adds what we make on each item, for ourselves rather than the bar.
// Specials are left out, listed alone or marked, like the screen's filter.
// Given a date, each price is shown next to the one it had then. Composites
// are listed like anything else; their colour compares with their sum.

const MUTED = "#6b7280";
// The special badge's colours on screen (Tailwind's violet).
const SPECIAL = {
  color: "#6d28d9",
  backgroundColor: "#f5f3ff",
  borderColor: "#c4b5fd",
};
const RULE = "#d1d5db";
// The price inputs' colours on screen (Tailwind's green-100 and red-100).
const TONES = {
  above: { backgroundColor: "#dcfce7", borderColor: "#86c99c" },
  below: { backgroundColor: "#fee2e2", borderColor: "#e3a0a0" },
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 16,
  },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  subtitle: { color: MUTED, marginTop: 3 },
  date: { color: MUTED },
  category: { marginBottom: 14 },
  categoryName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#111827",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
  },
  columnHeads: { color: MUTED, fontSize: 8 },
  name: { flex: 1, paddingRight: 8 },
  nameWithBadge: {
    flex: 1,
    paddingRight: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
  },
  specialBadge: {
    ...SPECIAL,
    marginVertical: -1.5,
    paddingVertical: 1.5,
    paddingHorizontal: 3,
    borderWidth: 0.5,
    borderRadius: 2,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
  },
  pricingCategory: { width: 110, paddingRight: 8 },
  number: { width: 60, textAlign: "right" },
  // Two more columns have to fit when comparing.
  narrowCategory: { width: 85 },
  narrow: { width: 52 },
  missing: { color: MUTED },
  changed: { fontFamily: "Helvetica-Bold" },
  // What it was, crossed out, next to what it is now.
  oldPrice: { color: MUTED, textDecoration: "line-through" },
  change: { width: 76, textAlign: "right", fontSize: 9, paddingTop: 1 },
  changeNote: { color: MUTED, fontFamily: "Helvetica-Oblique" },
  changeHead: { fontSize: 8, paddingTop: 0 },
  // Right-aligned, so a coloured price is only as wide as itself.
  priceCell: { width: 60, alignItems: "flex-end" },
  tonedPrice: {
    marginVertical: -1.5,
    paddingVertical: 1.5,
    paddingHorizontal: 3,
    borderWidth: 0.5,
    borderRadius: 2,
  },
  legend: { flexDirection: "row", alignItems: "center", gap: 4 },
  swatch: { width: 8, height: 8, borderWidth: 0.5, borderRadius: 1 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    color: MUTED,
    fontSize: 8,
  },
});

type Group = { id: number; name: string; rows: PricingRow[] };

// Rows arrive in the order page's order, so a category's rows are together.
function groupByCategory(rows: PricingRow[]) {
  const groups: Group[] = [];
  for (const row of rows) {
    let group = groups.at(-1);
    if (group?.id !== row.orderCategoryId) {
      group = {
        id: row.orderCategoryId,
        name: row.orderCategoryName,
        rows: [],
      };
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

export type PriceComparison = {
  date: Date;
  // From getSalePricesAt: only the items whose price changed since.
  prices: Map<number, number | null>;
};

function priceThen(row: PricingRow, comparison: PriceComparison) {
  return comparison.prices.has(row.id)
    ? comparison.prices.get(row.id)!
    : row.salePrice;
}

type PriceChange =
  | { kind: "same" }
  | { kind: "new" }
  | { kind: "removed" }
  | { kind: "up" | "down"; diff: number; fraction: number };

function priceChange(then: number | null, now: number | null): PriceChange {
  if (then === now) return { kind: "same" };
  if (then == null) return { kind: "new" };
  if (now == null) return { kind: "removed" };
  const diff = now - then;
  return {
    kind: diff > 0 ? "up" : "down",
    diff,
    fraction: then > 0 ? diff / then : 0,
  };
}

function ChangeText({ change }: { change: PriceChange }) {
  if (change.kind === "same") return <Text style={styles.change} />;
  if (change.kind === "new" || change.kind === "removed") {
    return (
      <Text style={[styles.change, styles.changeNote]}>{change.kind}</Text>
    );
  }
  const sign = change.kind === "up" ? "+" : "−";
  return (
    <Text style={styles.change}>
      {sign}
      {formatPrice(Math.abs(change.diff))}
      <Text style={styles.missing}>
        {" "}
        ({sign}
        {formatPercent(Math.abs(change.fraction))})
      </Text>
    </Text>
  );
}

// "46 changed: 40 up, 2 down, 4 new", leaving out what didn't happen.
function changeSummary(changes: PriceChange[]) {
  const count = (kind: PriceChange["kind"]) =>
    changes.filter((change) => change.kind === kind).length;
  const changed = changes.length - count("same");
  if (changed === 0) return "nothing changed";
  const parts = (["up", "down", "new", "removed"] as const)
    .map((kind) => [kind, count(kind)] as const)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${n} ${kind}`);
  return `${changed} changed: ${parts.join(", ")}`;
}

function PriceList({
  overview,
  details,
  specials,
  comparison,
  generatedAt,
}: {
  overview: PricingOverview;
  details: boolean;
  specials: SpecialsFilter;
  comparison: PriceComparison | null;
  generatedAt: Date;
}) {
  const groups = groupByCategory(
    overview.rows.filter(
      (row) => !row.notForSale && matchesSpecials(row.special, specials),
    ),
  );
  const categoryNames = new Map(
    overview.categories.map((category) => [category.id, category.name]),
  );
  // A list of only specials says so once, in the title, not on every row.
  const what = details ? "prices and margins" : "prices";
  const title =
    specials === "only"
      ? `Specials: ${what}`
      : what[0].toUpperCase() + what.slice(1);
  const markSpecials = specials === "any";

  const summary = comparison
    ? changeSummary(
        groups
          .flatMap((group) => group.rows)
          .map((row) => priceChange(priceThen(row, comparison), row.salePrice)),
      )
    : null;
  const number = comparison ? [styles.number, styles.narrow] : styles.number;
  const pricingCategory = comparison
    ? [styles.pricingCategory, styles.narrowCategory]
    : styles.pricingCategory;
  const showHeads = details || comparison != null;

  return (
    <Document title={`${title} ${formatDate(generatedAt)}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{title}</Text>
            {comparison && (
              <Text style={styles.subtitle}>
                Compared to the prices on {formatDate(comparison.date)} ·{" "}
                {summary}
              </Text>
            )}
          </View>
          <Text style={styles.date}>{formatDate(generatedAt)}</Text>
        </View>

        {groups.map((group) => (
          <View key={group.id} style={styles.category}>
            {/* Never a category name alone at the bottom of a page. */}
            <View wrap={false} minPresenceAhead={40}>
              <Text style={styles.categoryName}>{group.name}</Text>
              {showHeads && (
                <View style={[styles.row, styles.columnHeads]}>
                  <Text style={styles.name}>Item</Text>
                  {details && (
                    <Text style={pricingCategory}>Price category</Text>
                  )}
                  {comparison && (
                    <Text style={number}>{formatDate(comparison.date)}</Text>
                  )}
                  <Text style={number}>{comparison ? "Now" : "Price"}</Text>
                  {comparison && (
                    <Text style={[styles.change, styles.changeHead]}>
                      Change
                    </Text>
                  )}
                  {details && (
                    <>
                      <Text style={number}>Margin</Text>
                      <Text style={number}>Profit</Text>
                    </>
                  )}
                </View>
              )}
            </View>
            {group.rows.map((row) => {
              const then = comparison ? priceThen(row, comparison) : null;
              const change = priceChange(then, row.salePrice);
              const changed = comparison != null && change.kind !== "same";
              return (
                <View key={row.id} style={styles.row} wrap={false}>
                  {markSpecials && row.special ? (
                    <View style={styles.nameWithBadge}>
                      <Text>{row.name}</Text>
                      <Text style={styles.specialBadge}>SPECIAL</Text>
                    </View>
                  ) : (
                    <Text style={styles.name}>{row.name}</Text>
                  )}
                  {details && (
                    <Text style={pricingCategory}>
                      {row.composite
                        ? "Composite"
                        : row.pricingCategoryId != null
                          ? categoryNames.get(row.pricingCategoryId)
                          : "—"}
                    </Text>
                  )}
                  {comparison && (
                    // Only where it changed, so the changes stand out.
                    <Text style={[number, styles.oldPrice].flat()}>
                      {changed && then != null ? formatPrice(then) : ""}
                    </Text>
                  )}
                  {details ? (
                    <TonedPrice
                      row={row}
                      changed={changed}
                      narrow={!!comparison}
                    />
                  ) : (
                    <Text
                      style={[
                        number,
                        row.salePrice == null ? styles.missing : {},
                        changed ? styles.changed : {},
                      ].flat()}
                    >
                      {formatPrice(row.salePrice)}
                    </Text>
                  )}
                  {comparison && <ChangeText change={change} />}
                  {details && (
                    <>
                      <Text style={number}>{formatPercent(row.margin)}</Text>
                      <Text style={number}>{formatPrice(row.profit)}</Text>
                    </>
                  )}
                </View>
              );
            })}
          </View>
        ))}

        <View style={styles.footer} fixed>
          {details ? (
            <View style={styles.legend}>
              <Text>Prices include VAT ·</Text>
              <View style={[styles.swatch, TONES.above]} />
              <Text>above advice ·</Text>
              <View style={[styles.swatch, TONES.below]} />
              <Text>below advice · composites: against their sum</Text>
            </View>
          ) : (
            <Text>Prices include VAT</Text>
          )}
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

// Coloured like the price inputs on screen: green clearly above the advice,
// red clearly below it, and plain when close to it or without advice. A
// composite has its components' sum instead, where any difference counts.
function toneOf(row: PricingRow) {
  if (!row.composite) return priceTone(row.salePrice, row.advice);
  if (!pricesDiffer(row.salePrice, row.composite.sum)) return null;
  return row.salePrice! > row.composite.sum! ? "above" : "below";
}

function TonedPrice({
  row,
  changed,
  narrow,
}: {
  row: PricingRow;
  changed: boolean;
  narrow: boolean;
}) {
  const tone = toneOf(row);
  return (
    <View style={[styles.priceCell, narrow ? styles.narrow : {}]}>
      <Text
        style={[
          // Padded even when plain, so all prices line up.
          styles.tonedPrice,
          tone ? TONES[tone] : { borderColor: "transparent" },
          row.salePrice == null ? styles.missing : {},
          changed ? styles.changed : {},
        ].flat()}
      >
        {formatPrice(row.salePrice)}
      </Text>
    </View>
  );
}

export function renderPriceList(
  overview: PricingOverview,
  options: {
    details: boolean;
    specials: SpecialsFilter;
    comparison: PriceComparison | null;
  },
) {
  return renderToBuffer(
    <PriceList overview={overview} {...options} generatedAt={new Date()} />,
  );
}
