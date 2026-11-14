"use client";

import type { TransitionStartFunction } from "react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteItem, setItemArchived } from "./actions";

// The pieces both of the item dialog's forms are built from: the one for
// products and the one for composites.

// Stacked, this scrolls as a whole. Side by side, each panel scrolls on its
// own, and the panels run from the header to the footer.
export const PANELS =
  "-mx-4 grid min-h-0 flex-1 grid-cols-1 content-start items-start gap-6 overflow-x-hidden overflow-y-auto border-t px-4 pb-4 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)] lg:content-stretch lg:items-stretch lg:gap-0 lg:divide-x lg:overflow-hidden lg:px-0 lg:pb-0";

export const PANEL =
  "space-y-4 lg:min-h-0 lg:overflow-x-hidden lg:overflow-y-auto lg:px-4 lg:pb-4";

// Stays in view while its section scrolls. The solid layer keeps the fields
// from showing through the tint, which matches the dialog's footer.
export function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-4 bg-popover">
      <div className="flex items-center gap-2.5 border-b bg-muted/50 px-4 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm leading-tight font-semibold">{title}</h3>
          {/* On a phone this band stays pinned, so it has to stay short. */}
          <p className="hidden text-xs text-muted-foreground lg:block">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

export function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => onChange(String(next))}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Archive, restore and delete on the left, save on the right.
export function ItemDialogFooter({
  item,
  pending,
  startTransition,
  onClose,
  addLabel = "Add item",
}: {
  item: { id: number; name: string; archivedAt: Date | null } | null;
  pending: boolean;
  addLabel?: string;
  startTransition: TransitionStartFunction;
  onClose: () => void;
}) {
  function onArchive() {
    if (!item) return;
    const archived = item.archivedAt !== null;
    startTransition(async () => {
      const result = await setItemArchived(item.id, !archived);
      if (result.ok) {
        toast.success(archived ? "Item restored" : "Item archived");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  function onDelete() {
    if (!item) return;
    if (!confirm(`Delete “${item.name}” permanently?`)) return;
    startTransition(async () => {
      const result = await deleteItem(item.id);
      if (result.ok) {
        toast.success("Item deleted");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <DialogFooter className="shrink-0 flex-row items-center justify-between sm:justify-between">
      <div className="flex gap-2">
        {item && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onArchive}
              disabled={pending}
            >
              {item.archivedAt ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
              {item.archivedAt ? "Restore" : "Archive"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onDelete}
              disabled={pending}
              aria-label="Delete item"
            >
              <Trash2Icon />
            </Button>
          </>
        )}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          !item && <PlusIcon />
        )}
        {item ? "Save" : addLabel}
      </Button>
    </DialogFooter>
  );
}
