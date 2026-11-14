"use client";

import { useState } from "react";
import { FileDownIcon } from "lucide-react";
import type { SpecialsFilter } from "@/components/special-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDate } from "@/lib/format";

const EXPORTS = [
  {
    details: false,
    label: "Prices",
    description: "Just what each item sells for",
  },
  {
    details: true,
    label: "Prices and margins",
    description: "With the price category, margin and profit",
  },
];

const SPECIALS_NOTES: Record<SpecialsFilter, string> = {
  any: "Specials included and marked",
  only: "Only specials",
  none: "Without specials",
};

// A day as a date field takes it, in the app's own time zone.
function dayKey(date: Date) {
  return date.toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

function exportHref(
  details: boolean,
  specials: SpecialsFilter,
  since: string,
) {
  const params = new URLSearchParams();
  if (details) params.set("details", "1");
  if (specials !== "any") params.set("specials", specials);
  if (since) params.set("since", since);
  const query = params.toString();
  return query ? `/pricing/pdf?${query}` : "/pricing/pdf";
}

// Everything for sale, whatever the view or search; only the specials filter
// carries over, since it decides what a printed list is for. A date adds the
// prices as they were then, to see what changed.
export function ExportPdfButton({
  specials,
  historyStart,
}: {
  specials: SpecialsFilter;
  historyStart: Date | null;
}) {
  const [since, setSince] = useState("");

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>
        <FileDownIcon />
        Export PDF
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-1 p-1">
        <div className="space-y-1.5 border-b px-2.5 pt-1.5 pb-2.5">
          <Label htmlFor="export-since">Compare to the prices on</Label>
          <Input
            id="export-since"
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            min={historyStart ? dayKey(historyStart) : undefined}
            max={dayKey(new Date())}
          />
          <p className="text-xs text-muted-foreground">
            Optional.
            {historyStart &&
              ` Price history starts on ${formatDate(historyStart)}.`}
          </p>
        </div>
        {EXPORTS.map((option) => (
          <a
            key={option.label}
            href={exportHref(option.details, specials, since)}
            target="_blank"
            rel="noopener"
            className="rounded-md px-2.5 py-2 hover:bg-muted"
          >
            <p className="text-sm font-medium">{option.label}</p>
            <p className="text-xs text-muted-foreground">
              {option.description}
            </p>
          </a>
        ))}
        <p className="border-t px-2.5 pt-1.5 pb-1 text-xs text-muted-foreground">
          {SPECIALS_NOTES[specials]}, like the filter
        </p>
      </PopoverContent>
    </Popover>
  );
}
