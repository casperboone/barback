import { StarIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Marks an item that's only here for a limited time, in the same colour as
// the filter that finds them.
export function SpecialBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 border-violet-600/25 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
        className,
      )}
    >
      <StarIcon />
      Special
    </Badge>
  );
}

export type SpecialsFilter = "any" | "only" | "none";

export function matchesSpecials(special: boolean, filter: SpecialsFilter) {
  return filter === "any" || special === (filter === "only");
}

// Narrows a list to its specials, or leaves them out, on top of whichever
// view it shows. Looks like the view tabs, in the badge's colour when on.
export function SpecialsFilterTabs({
  current,
  count,
  onSelect,
}: {
  current: SpecialsFilter;
  // Specials in the current view.
  count: number;
  onSelect: (filter: SpecialsFilter) => void;
}) {
  const options: { value: SpecialsFilter; label: string; title: string }[] = [
    { value: "any", label: "Show", title: "Show specials" },
    { value: "only", label: `Only (${count})`, title: "Only specials" },
    { value: "none", label: "Hide", title: "Hide specials" },
  ];

  return (
    <div
      role="group"
      aria-label="Specials"
      className="flex w-fit max-w-full items-center gap-0.5 rounded-lg bg-border/60 p-[3px]"
    >
      <span className="flex items-center gap-1 pr-1 pl-2 text-sm text-muted-foreground">
        <StarIcon className="size-3.5" />
        Specials
      </span>
      {options.map((option) => {
        const active = option.value === current;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            title={option.title}
            onClick={() => onSelect(option.value)}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
              !active && "text-muted-foreground hover:text-foreground",
              active &&
                (option.value === "any"
                  ? "bg-background text-foreground shadow-sm"
                  : "bg-violet-600 text-white shadow-sm dark:bg-violet-500"),
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
