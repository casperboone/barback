"use client";

import { useState } from "react";
import { ViewTabs } from "@/components/section-tabs";
import { formatPrice } from "@/lib/format";
import { niceTicks, type Granularity } from "@/lib/items/quantity-history";
import type { BalanceBucket } from "@/lib/products/deposits";
import { cn } from "@/lib/utils";

export type BalanceHistory = {
  key: string;
  label: string;
  granularity: Granularity;
  buckets: BalanceBucket[];
};

// Past this many points the dots crowd the line, so only the hovered one shows.
const MAX_DOTS = 24;

function signed(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatPrice(Math.abs(value))}`;
}

// How the deposit balance moved, in the style of the item page's charts. The
// periods are worked out on the server per range, so the page doesn't have to
// ship every deposit line.
export function BalanceChart({ histories }: { histories: BalanceHistory[] }) {
  const [key, setKey] = useState(histories[0]?.key);
  const [active, setActive] = useState<number | null>(null);
  const history = histories.find((h) => h.key === key) ?? histories[0];
  if (!history || history.buckets.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No deposit lines imported yet.
      </p>
    );
  }

  const { buckets, granularity } = history;
  const values = buckets.map((bucket) => bucket.balance);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const low = ticks[0];
  const high = ticks.at(-1)!;
  const pct = (value: number) => ((value - low) / (high - low)) * 100;

  const x = (index: number) => ((index + 0.5) / buckets.length) * 100;
  const y = (value: number) => 100 - pct(value);
  const linePoints = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const areaPoints = `${x(0)},${y(0)} ${linePoints} ${x(values.length - 1)},${y(0)}`;
  const dots = buckets.length <= MAX_DOTS;

  // About six labels, counted back from the current period so it has one.
  const labelStep = buckets.length <= 7 ? 1 : Math.ceil(buckets.length / 6);
  const hovered = active != null ? buckets[active] : null;
  const first = buckets[0];
  const last = buckets.at(-1)!;

  return (
    <div className="space-y-3">
      <ViewTabs
        label="Date range"
        current={history.key}
        onSelect={(next) => {
          setKey(next);
          setActive(null);
        }}
        views={histories.map((h) => ({ value: h.key, label: h.label }))}
      />

      <p className="text-sm text-muted-foreground">
        <span className="text-base font-semibold text-foreground tabular-nums">
          {formatPrice(last.balance)}
        </span>{" "}
        out now
        {buckets.length > 1 && (
          <>
            {" "}
            · <span className="tabular-nums">{signed(last.balance - first.balance + first.change)}</span>{" "}
            since {first.title}
          </>
        )}
      </p>

      <div style={{ "--gutter": "3.75rem" } as React.CSSProperties}>
        <div className="relative h-44">
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
                {/* Round amounts, so the cents only take room. */}
                {formatPrice(tick).replace(/,00$/, "")}
              </span>
            </div>
          ))}

          <svg
            className="pointer-events-none absolute inset-y-0 right-0 left-(--gutter) h-full w-[calc(100%-var(--gutter))] overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <polygon
              points={areaPoints}
              className="fill-emerald-500/10 dark:fill-emerald-400/10"
            />
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

          <div
            className="absolute inset-y-0 right-0 left-(--gutter) flex"
            onPointerLeave={() => setActive(null)}
          >
            {buckets.map((bucket, index) => {
              const isActive = index === active;
              return (
                // The whole column is the hit target, not just the dot.
                <div
                  key={bucket.start}
                  className="relative h-full flex-1"
                  onPointerEnter={() => setActive(index)}
                  onClick={() => setActive(index)}
                >
                  {isActive && (
                    <div className="absolute inset-y-0 left-1/2 border-l border-foreground/20" />
                  )}
                  {(isActive || dots) && (
                    // In HTML rather than the stretched SVG, so it stays round.
                    <div
                      className={cn(
                        "absolute left-1/2 size-2 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-background",
                        isActive
                          ? "size-2.5 bg-emerald-700 dark:bg-emerald-300"
                          : "bg-emerald-600 dark:bg-emerald-400",
                      )}
                      style={{ bottom: `${pct(bucket.balance)}%` }}
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
                // Beside the hovered period, on the side with more room.
                left: `calc(var(--gutter) + (100% - var(--gutter)) * ${(active + 0.5) / buckets.length})`,
                transform:
                  active < buckets.length / 2
                    ? "translateX(1rem)"
                    : "translateX(calc(-100% - 1rem))",
              }}
            >
              <div className="text-muted-foreground">{hovered.title}</div>
              <div className="font-medium tabular-nums">
                {formatPrice(hovered.balance)} out
              </div>
              <div className="text-muted-foreground tabular-nums">
                {hovered.change === 0
                  ? `No change this ${granularity}`
                  : `${signed(hovered.change)} this ${granularity}`}
              </div>
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

      {/* The same numbers for a screen reader, which can't hover a line. */}
      <table className="sr-only">
        <caption>Deposit balance at the end of each {granularity}</caption>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.start}>
              <th scope="row">{bucket.title}</th>
              <td>{formatPrice(bucket.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
