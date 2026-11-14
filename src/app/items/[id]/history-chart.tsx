"use client";

import { useMemo, useState } from "react";
import { ViewTabs } from "@/components/section-tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatNumber, formatPercent, formatPrice } from "@/lib/format";
import {
  allowedGranularity,
  averagePrice,
  bucketQuantities,
  defaultGranularity,
  niceTicks,
  rangeBounds,
  type Granularity,
  type QuantityBucket,
  type QuantityPoint,
  type QuantityRange,
} from "@/lib/items/quantity-history";
import { cn } from "@/lib/utils";

type RangeKey = "3m" | "12m" | "ytd" | "3y" | "all" | "year";

const RANGE_VIEWS: { value: RangeKey; label: string }[] = [
  { value: "3m", label: "3 months" },
  { value: "12m", label: "12 months" },
  { value: "ytd", label: "YTD" },
  { value: "3y", label: "3 years" },
  { value: "all", label: "All" },
];

type ChartType = "bars" | "line";

const CHART_VIEWS: { value: ChartType; label: string }[] = [
  { value: "bars", label: "Bars" },
  { value: "line", label: "Line" },
];

// Past this many points the dots crowd the line, so only the hovered one shows.
const MAX_DOTS = 24;

const GRANULARITY_VIEWS: { value: Granularity; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

function toRange(key: RangeKey, year: number, today: string): QuantityRange {
  switch (key) {
    case "3m":
      return { kind: "rolling", months: 3 };
    case "12m":
      return { kind: "rolling", months: 12 };
    case "ytd":
      return { kind: "year", year: Number(today.slice(0, 4)) };
    case "3y":
      return { kind: "rolling", months: 36 };
    case "all":
      return { kind: "all" };
    case "year":
      return { kind: "year", year };
  }
}

const DAY = 86_400_000;
const MONTH_DAYS = 365.25 / 12;

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// What a chart shows per period: the units bought, which add up and start at
// zero, or the average unit price, which is a level and only exists where
// something was bought.
type Measure = "quantity" | "price";

function valueOf(measure: Measure, bucket: QuantityBucket) {
  return measure === "price" ? averagePrice(bucket) : bucket.quantity;
}

// Units bought or the price paid per week, month, quarter or year, from the
// invoice lines the page already has. `today` comes from the server so both
// sides agree on it.
export function HistoryChart({
  measure,
  points,
  today,
  unit,
}: {
  measure: Measure;
  points: QuantityPoint[];
  today: string;
  unit: string;
}) {
  const firstDay = useMemo(
    () =>
      points.reduce<string | null>(
        (first, p) => (!first || p.day < first ? p.day : first),
        null,
      ),
    [points],
  );
  const years = useMemo(() => {
    const set = new Set(points.map((p) => Number(p.day.slice(0, 4))));
    set.add(Number(today.slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [points, today]);

  const [rangeKey, setRangeKey] = useState<RangeKey>("12m");
  const [year, setYear] = useState(years[0]);
  const range = toRange(rangeKey, year, today);
  const [granularity, setGranularity] = useState<Granularity>(() =>
    defaultGranularity(range, today, firstDay),
  );
  // A price is a level, not an amount, so it never gets bars.
  const [chosenType, setChartType] = useState<ChartType>("bars");
  const chartType = measure === "price" ? "line" : chosenType;
  const [active, setActive] = useState<number | null>(null);

  // A new range starts at the granularity that suits it.
  function selectRange(key: RangeKey, nextYear = year) {
    setRangeKey(key);
    setYear(nextYear);
    setActive(null);
    setGranularity(
      defaultGranularity(toRange(key, nextYear, today), today, firstDay),
    );
  }

  const buckets = bucketQuantities(points, range, granularity, today);
  // Early in January a year to date is too short for any; keep the one in use.
  const granularities = GRANULARITY_VIEWS.filter(
    (view) =>
      view.value === granularity ||
      allowedGranularity(range, view.value, today, firstDay),
  );

  const values = buckets.map((bucket) => valueOf(measure, bucket));
  const known = values.filter((value): value is number => value != null);
  const empty = known.every((value) => value === 0);

  let ticks: number[];
  if (empty) {
    ticks = [0, 1, 2, 3, 4];
  } else if (measure === "price") {
    // Prices move a few percent, which a scale from zero would flatten. Some
    // room above and below, also when the price never changed.
    const min = Math.min(...known);
    const max = Math.max(...known);
    const pad = Math.max((max - min) * 0.15, max * 0.02);
    ticks = niceTicks(Math.max(0, min - pad), max + pad);
  } else {
    ticks = niceTicks(Math.min(0, ...known), Math.max(0, ...known));
  }
  const low = ticks[0];
  const high = ticks.at(-1)!;
  const pct = (value: number) => ((value - low) / (high - low)) * 100;
  const formatTick = (tick: number) =>
    measure === "price" ? formatPrice(tick) : formatNumber(tick, 1);

  // About six labels, counted back from the current period so it has one.
  const labelStep = buckets.length <= 7 ? 1 : Math.ceil(buckets.length / 6);
  const hovered = active != null ? buckets[active] : null;
  const hoveredValue = active != null ? values[active] : null;

  // The line runs through the middle of each period, like the bars stand
  // there. A price skips the periods without one and joins the ones around it.
  const x = (index: number) => ((index + 0.5) / buckets.length) * 100;
  const y = (value: number) => 100 - pct(value);
  const linePoints = values
    .flatMap((value, index) =>
      value == null ? [] : [`${x(index)},${y(value)}`],
    )
    .join(" ");
  const areaPoints = `${x(0)},${y(0)} ${linePoints} ${x(buckets.length - 1)},${y(0)}`;
  const dots = known.length <= MAX_DOTS;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ViewTabs
          label="Date range"
          current={rangeKey}
          onSelect={(key) => selectRange(key)}
          views={RANGE_VIEWS}
        />
        <Select
          items={years.map((y) => ({ value: String(y), label: String(y) }))}
          value={rangeKey === "year" ? String(year) : null}
          onValueChange={(value) => value && selectRange("year", Number(value))}
        >
          <SelectTrigger
            size="sm"
            aria-label="Calendar year"
            className={cn(
              "w-24 bg-background",
              rangeKey === "year" && "border-foreground/40",
            )}
          >
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ViewTabs
          label="Per"
          current={granularity}
          onSelect={(value) => {
            setGranularity(value);
            setActive(null);
          }}
          views={granularities}
        />
        {measure === "quantity" && (
          <ViewTabs
            label="Chart type"
            current={chartType}
            onSelect={setChartType}
            views={CHART_VIEWS}
          />
        )}
      </div>

      {measure === "price" ? (
        <PriceSummary values={known} />
      ) : (
        <QuantitySummary
          buckets={buckets}
          unit={unit}
          range={rangeBounds(range, today, firstDay)}
        />
      )}

      <div
        // Room for the axis labels; a price takes more than a count.
        style={
          { "--gutter": measure === "price" ? "3.25rem" : "2rem" } as React.CSSProperties
        }
      >
        <div className="relative h-40">
          {ticks.map((tick) => (
            <div
              key={tick}
              className={cn(
                "absolute inset-x-0 border-t",
                tick === 0 ? "border-foreground/30" : "border-border",
              )}
              style={{ bottom: `${pct(tick)}%` }}
            >
              <span className="absolute left-0 w-(--gutter) -translate-y-1/2 pr-1.5 text-right text-[10px] leading-none text-muted-foreground tabular-nums">
                {formatTick(tick)}
              </span>
            </div>
          ))}

          {empty && (
            <p className="absolute inset-y-0 right-0 left-(--gutter) flex items-center justify-center text-sm text-muted-foreground">
              Nothing bought in this period.
            </p>
          )}

          {chartType === "line" && !empty && (
            <svg
              className="pointer-events-none absolute inset-y-0 right-0 left-(--gutter) h-full w-[calc(100%-var(--gutter))] overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              {/* A wash down to zero only means something for amounts. */}
              {measure === "quantity" && (
                <polygon
                  points={areaPoints}
                  className="fill-emerald-500/10 dark:fill-emerald-400/10"
                />
              )}
              <polyline
                points={linePoints}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-emerald-600 dark:stroke-emerald-400"
              />
            </svg>
          )}

          <div
            className="absolute inset-y-0 right-0 left-(--gutter) flex"
            onPointerLeave={() => setActive(null)}
          >
            {buckets.map((bucket, index) => {
              const value = values[index];
              const isActive = index === active;
              return (
                // The whole column is the hit target, not just the bar.
                <div
                  key={bucket.start}
                  className={cn(
                    "relative h-full flex-1 rounded-sm",
                    isActive && chartType === "bars" && "bg-muted",
                  )}
                  onPointerEnter={() => setActive(index)}
                  onClick={() => setActive(index)}
                >
                  {chartType === "line" && isActive && (
                    <div className="absolute inset-y-0 left-1/2 border-l border-foreground/20" />
                  )}
                  {chartType === "line" &&
                    !empty &&
                    value != null &&
                    (isActive || dots) && (
                      // In HTML rather than the stretched SVG, so it stays round.
                      <div
                        className={cn(
                          "absolute left-1/2 size-2 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-background",
                          isActive
                            ? "size-2.5 bg-emerald-700 dark:bg-emerald-300"
                            : "bg-emerald-600 dark:bg-emerald-400",
                        )}
                        style={{ bottom: `${pct(value)}%` }}
                      />
                    )}
                  {chartType === "bars" && value != null && value !== 0 && (
                    <div
                      className={cn(
                        "absolute left-1/2 -translate-x-1/2 transition-colors",
                        value > 0 ? "rounded-t-[4px]" : "rounded-b-[4px]",
                        value < 0
                          ? "bg-destructive/70"
                          : isActive
                            ? "bg-emerald-700 dark:bg-emerald-300"
                            : "bg-emerald-500 dark:bg-emerald-500",
                      )}
                      style={{
                        width: "min(24px, calc(100% - 2px))",
                        bottom: `${pct(Math.min(value, 0))}%`,
                        height: `max(2px, ${pct(Math.max(value, 0)) - pct(Math.min(value, 0))}%)`,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {hovered && active != null && (
            <div
              className="pointer-events-none absolute top-0 z-10 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md"
              style={{
                // Beside the hovered period, on the side with more room, so it
                // covers neither that period nor the controls above.
                left: `calc(var(--gutter) + (100% - var(--gutter)) * ${(active + 0.5) / buckets.length})`,
                transform:
                  active < buckets.length / 2
                    ? "translateX(1rem)"
                    : "translateX(calc(-100% - 1rem))",
              }}
            >
              <div className="text-muted-foreground">{hovered.title}</div>
              {measure === "price" ? (
                <>
                  <div className="font-medium tabular-nums">
                    {hoveredValue == null
                      ? "Not bought"
                      : `${formatPrice(hoveredValue)} per unit`}
                  </div>
                  {hovered.lowestPrice != null &&
                    hovered.highestPrice != null &&
                    hovered.highestPrice - hovered.lowestPrice >= 0.005 && (
                      <div className="text-muted-foreground tabular-nums">
                        {formatPrice(hovered.lowestPrice)} –{" "}
                        {formatPrice(hovered.highestPrice)}
                      </div>
                    )}
                  {hoveredValue != null && (
                    <div className="text-muted-foreground">
                      {formatNumber(hovered.quantity, 1)} {unit} on{" "}
                      {plural(hovered.documents, "invoice")}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="font-medium tabular-nums">
                    {formatNumber(hovered.quantity, 1)} {unit}
                    {hovered.quantity < 0 && " returned"}
                  </div>
                  {hovered.documents > 0 && (
                    <div className="text-muted-foreground">
                      {plural(hovered.documents, "invoice")}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-1 flex pl-(--gutter)" aria-hidden>
          {buckets.map((bucket, index) => (
            <div
              key={bucket.start}
              className="relative h-4 flex-1 text-[10px] text-muted-foreground"
            >
              {(buckets.length - 1 - index) % labelStep === 0 && (
                <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
                  {bucket.label}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* The same numbers for a screen reader, which can't hover a bar. */}
      <table className="sr-only">
        <caption>
          {measure === "price"
            ? `Average price per unit per ${granularity}`
            : `${unit} bought per ${granularity}`}
        </caption>
        <tbody>
          {buckets.map((bucket, index) => (
            <tr key={bucket.start}>
              <th scope="row">{bucket.title}</th>
              <td>
                {measure === "price"
                  ? formatPrice(values[index])
                  : formatNumber(bucket.quantity, 1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuantitySummary({
  buckets,
  unit,
  range,
}: {
  buckets: QuantityBucket[];
  unit: string;
  range: { from: string; to: string };
}) {
  const total = buckets.reduce((sum, b) => sum + b.quantity, 0);
  const documents = buckets.reduce((sum, b) => sum + b.documents, 0);
  const months =
    (Date.parse(range.to) - Date.parse(range.from) + DAY) / DAY / MONTH_DAYS;
  return (
    <p className="text-sm text-muted-foreground">
      <span className="text-base font-semibold text-foreground tabular-nums">
        {formatNumber(total, 1)} {unit}
      </span>{" "}
      on {plural(documents, "invoice")}
      {months >= 2 && <> · ≈ {formatNumber(total / months, 1)} per month</>}
    </p>
  );
}

// The latest price against the first one in the range.
function PriceSummary({ values }: { values: number[] }) {
  if (values.length === 0) {
    return <p className="text-sm text-muted-foreground">No price to show.</p>;
  }
  const first = values[0];
  const last = values.at(-1)!;
  const change = last / first - 1;
  return (
    <p className="text-sm text-muted-foreground">
      <span className="text-base font-semibold text-foreground tabular-nums">
        {formatPrice(last)}
      </span>{" "}
      per unit, latest in this period
      {values.length > 1 && Math.abs(change) >= 0.0005 && (
        <>
          {" "}
          · from {formatPrice(first)} (
          <span className="tabular-nums">
            {change > 0 && "+"}
            {formatPercent(change, 1)}
          </span>
          )
        </>
      )}
      {values.length > 1 && Math.abs(change) < 0.0005 && " · unchanged"}
    </p>
  );
}
