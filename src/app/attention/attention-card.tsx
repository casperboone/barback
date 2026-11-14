import Link from "next/link";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "bad" | "warn";

export const TONE_TEXT: Record<Tone, string> = {
  bad: "text-destructive",
  warn: "text-amber-700 dark:text-amber-400",
};

const TONE_BADGE: Record<Tone, string> = {
  bad: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  warn: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

// The worst few cases are enough to decide whether to go and look; the rest
// fold open underneath.
const MAX_ROWS = 5;

// One kind of thing that needs doing: how many, the worst few, and the way to
// the screen that has all of them.
export function AttentionCard({
  title,
  tone,
  summary,
  href,
  rows,
}: {
  title: string;
  tone: Tone;
  summary: React.ReactNode;
  href: string;
  rows: React.ReactNode[];
}) {
  const rest = rows.slice(MAX_ROWS);
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border bg-background",
        tone === "bad" && "border-destructive/30"
      )}
    >
      <Link
        href={href}
        className="flex items-center gap-2 px-3 pt-3 pb-1 transition-colors hover:bg-muted/50"
      >
        <AlertTriangleIcon className={cn("size-4 shrink-0", TONE_TEXT[tone])} />
        <h2 className="font-semibold">{title}</h2>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
            TONE_BADGE[tone]
          )}
        >
          {rows.length}
        </span>
        <span className="ml-auto flex items-center text-xs text-muted-foreground">
          Details
          <ChevronRightIcon className="size-4" />
        </span>
      </Link>
      <div className="px-3 pb-3 text-sm text-muted-foreground">{summary}</div>
      <ul className="divide-y border-t">{rows.slice(0, MAX_ROWS)}</ul>
      {rest.length > 0 && (
        <details className="group border-t">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">and {rest.length} more</span>
            <span className="hidden group-open:inline">Show fewer</span>
            <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="divide-y border-t">{rest}</ul>
        </details>
      )}
    </section>
  );
}

// One case, leading to where it can be dealt with, with room at the end for
// what can be done right here. Tall enough to tap.
export function AttentionRow({
  href,
  title,
  meta,
  aside,
  action,
  muted = false,
}: {
  href: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  aside?: React.ReactNode;
  action?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <li className="flex items-stretch">
      <Link
        href={href}
        className={cn(
          "flex min-h-12 min-w-0 flex-1 items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/50",
          muted && "opacity-70"
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium [overflow-wrap:anywhere]">
            {title}
          </div>
          {meta && (
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums">
              {meta}
            </div>
          )}
        </div>
        {aside && (
          <div className="shrink-0 text-right text-sm tabular-nums">
            {aside}
          </div>
        )}
      </Link>
      {action}
    </li>
  );
}

// What was checked and is fine, in one line each, so "nothing here" reads as
// checked rather than forgotten.
export function FineList({
  items,
}: {
  items: { key: string; title: string; detail: React.ReactNode; href: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-lg border bg-background">
      <h2 className="border-b bg-muted/50 px-3 py-2 text-xs font-semibold tracking-wide uppercase">
        Checked, nothing to do
      </h2>
      <ul className="divide-y">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="flex min-h-11 items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
            >
              <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="flex min-w-0 flex-1 flex-wrap gap-x-2">
                <span className="font-medium">{item.title}</span>
                <span className="text-muted-foreground">{item.detail}</span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Everything ticked off as known, folded away, each with a way back.
export function AcknowledgedList({ rows }: { rows: React.ReactNode[] }) {
  if (rows.length === 0) return null;
  return (
    <details className="group overflow-hidden rounded-lg border bg-background">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm transition-colors hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
        <span className="font-medium">Acknowledged</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
          {rows.length}
        </span>
        <span className="text-muted-foreground max-sm:hidden">
          Hidden until they change
        </span>
        <ChevronDownIcon className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <ul className="divide-y border-t">{rows}</ul>
    </details>
  );
}
