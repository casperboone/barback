import Link from "next/link";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
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

// The worst few cases are enough to decide whether to go and look.
export const MAX_ROWS = 5;

// One kind of thing that needs doing: how many, the worst few, and the way to
// the screen that has all of them.
export function AttentionCard({
  title,
  count,
  tone,
  summary,
  href,
  children,
  more = 0,
  className,
}: {
  title: string;
  count: number;
  tone: Tone;
  summary: React.ReactNode;
  href: string;
  children?: React.ReactNode;
  // Cases that didn't fit; they're on the linked screen.
  more?: number;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border bg-background",
        tone === "bad" && "border-destructive/30",
        className
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
          {count}
        </span>
        <span className="ml-auto flex items-center text-xs text-muted-foreground">
          Details
          <ChevronRightIcon className="size-4" />
        </span>
      </Link>
      <div className="px-3 pb-3 text-sm text-muted-foreground">{summary}</div>
      {children && <ul className="divide-y border-t">{children}</ul>}
      {more > 0 && (
        <Link
          href={href}
          className="block border-t px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          and {more} more
        </Link>
      )}
    </section>
  );
}

// One case, leading to where it can be dealt with. Tall enough to tap.
export function AttentionRow({
  href,
  title,
  meta,
  aside,
}: {
  href: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-12 items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/50"
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
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </Link>
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
