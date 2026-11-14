"use client";

import { useTransition } from "react";
import { CheckIcon, Loader2Icon, Undo2Icon } from "lucide-react";
import { toast } from "sonner";
import type { Ack } from "@/lib/attention/queries";
import { cn } from "@/lib/utils";
import { acknowledge, unacknowledge } from "./actions";

// Ticks a case off as known, or puts it back. A full-height strip at the end
// of the row, so it is easy to hit with a thumb and hard to mix up with the
// row's own link.
export function AckButton({ ack, label }: { ack: Ack; label: string }) {
  const [pending, startTransition] = useTransition();
  const acknowledged = ack.acknowledgedAt !== null;
  const title = acknowledged ? "Show again" : "Acknowledge";

  function run() {
    startTransition(async () => {
      const result = acknowledged
        ? await unacknowledge(ack.key)
        : await acknowledge(ack.key, ack.fingerprint);
      if (!result.ok) toast.error(result.error);
    });
  }

  const Icon = pending ? Loader2Icon : acknowledged ? Undo2Icon : CheckIcon;
  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      title={title}
      aria-label={`${title}: ${label}`}
      className="flex w-12 shrink-0 items-center justify-center border-l text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset disabled:opacity-50"
    >
      <Icon className={cn("size-4", pending && "animate-spin")} />
    </button>
  );
}
