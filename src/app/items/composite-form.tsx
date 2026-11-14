"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BlendIcon, PackageIcon, SearchIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { OpenItemLink } from "@/components/item-links";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { suggestQueries } from "@/lib/images/search";
import {
  formatInputNumber,
  formatPercent,
  formatPrice,
} from "@/lib/format";
import type { ComponentOption, ItemDialogData } from "@/lib/items/queries";
import { margin } from "@/lib/pricing/calc";
import { compositeCost, compositeSum, pricesDiffer } from "@/lib/pricing/composite";
import { parseTypedNumber } from "@/lib/numbers";
import { cn } from "@/lib/utils";
import { ImagePicker } from "@/app/order-list/image-picker";
import { SalePriceHistoryList } from "@/app/pricing/sale-price-history";
import { saveComposite } from "./actions";
import {
  ItemDialogFooter,
  PANEL,
  PANELS,
  SectionHeading,
  SelectField,
} from "./dialog-parts";
import type { ItemDialogState } from "./item-dialog";

const NEW_CATEGORY = "new";

type Line = { componentId: number; quantity: string };

// The item dialog for a composite: something we sell that's made of other
// items. It's never ordered, so there's no target, catalog link or purchase
// price; what it adds up to comes from its components.
export function CompositeForm({
  state,
  data,
  onClose,
}: {
  state: ItemDialogState;
  data: ItemDialogData;
  onClose: () => void;
}) {
  const { item, orderCategories, componentOptions } = data;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(item?.name ?? "");
  const [categoryId, setCategoryId] = useState(
    String(
      item?.categoryId ??
        (state.mode === "create" ? state.categoryId : undefined) ??
        orderCategories[0]?.id ??
        "",
    ),
  );
  const [newCategory, setNewCategory] = useState("");
  const [note, setNote] = useState(item?.note ?? "");
  const [special, setSpecial] = useState(item?.special ?? false);
  const [lines, setLines] = useState<Line[]>(
    data.components.map((component) => ({
      componentId: component.componentId,
      quantity: formatInputNumber(component.quantity),
    })),
  );
  const [query, setQuery] = useState("");

  const options = useMemo(
    () => new Map(componentOptions.map((option) => [option.id, option])),
    [componentOptions],
  );

  const parts = lines.flatMap((line) => {
    const option = options.get(line.componentId);
    if (!option) return [];
    return [
      {
        id: option.id,
        quantity: parseTypedNumber(line.quantity) ?? 0,
        salePrice: option.salePrice,
        cost: option.cost,
      },
    ];
  });
  const sum = compositeSum(parts);
  const cost = compositeCost(parts);
  const price = item?.salePrice ?? null;

  const term = query.trim().toLowerCase();
  const results =
    term.length === 0
      ? []
      : componentOptions
          .filter(
            (option) =>
              !option.archived &&
              !lines.some((line) => line.componentId === option.id) &&
              option.name.toLowerCase().includes(term),
          )
          .slice(0, 8);

  function add(option: ComponentOption) {
    setLines((current) => [
      ...current,
      { componentId: option.id, quantity: "1" },
    ]);
    setQuery("");
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const quantities = lines.map((line) => parseTypedNumber(line.quantity));
    if (quantities.some((quantity) => quantity == null || quantity <= 0)) {
      toast.error("Every component needs a quantity above zero.");
      return;
    }
    startTransition(async () => {
      const result = await saveComposite({
        id: item?.id,
        name,
        categoryId:
          categoryId === NEW_CATEGORY
            ? undefined
            : Number(categoryId) || undefined,
        newCategoryName:
          categoryId === NEW_CATEGORY ? newCategory.trim() : undefined,
        note: note.trim() || null,
        special,
        components: lines.map((line, index) => ({
          componentId: line.componentId,
          quantity: quantities[index]!,
        })),
      });
      if (result.ok) {
        toast.success(item ? "Composite saved" : "Composite added");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <DialogHeader className="shrink-0">
        <DialogTitle className="pr-6 leading-snug break-words lg:pr-32">
          {item ? item.name : "New composite"}
        </DialogTitle>
        <DialogDescription className="break-words">
          Sold, never ordered: made of other items, like a gin-tonic. It
          shows on the pricing screen only, with what its components sell for
          together.
        </DialogDescription>
        {item && (
          <div className="lg:absolute lg:top-2.5 lg:right-11">
            <OpenItemLink itemId={item.id} label="Open item" className="w-fit" />
          </div>
        )}
      </DialogHeader>

      <form
        onSubmit={onSubmit}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div className={PANELS}>
          <section className={PANEL}>
            <SectionHeading
              icon={PackageIcon}
              title="Details"
              description="How it shows on the pricing screen and the price list."
            />

            <div className="space-y-2">
              <Label htmlFor="composite-name">Name</Label>
              <Input
                id="composite-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Gin-tonic"
                autoFocus={!item}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <SelectField
                value={categoryId}
                onChange={setCategoryId}
                options={[
                  ...orderCategories.map((c) => ({
                    value: String(c.id),
                    label: c.name,
                  })),
                  { value: NEW_CATEGORY, label: "New category…" },
                ]}
              />
              {categoryId === NEW_CATEGORY && (
                <Input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Category name"
                  required
                />
              )}
              <p className="text-xs text-muted-foreground">
                The heading it&apos;s listed under on the pricing screen and
                the price list.
              </p>
            </div>

            {item && (
              <div className="space-y-2">
                <Label>Image</Label>
                <ImagePicker
                  itemId={item.id}
                  hasOwnImage={item.hasOwnImage}
                  supplierItemNo={null}
                  suggestions={suggestQueries({
                    name: name.trim() || item.name,
                    supplierDescription: null,
                  })}
                  searchOnOpen={false}
                  onChanged={() => router.refresh()}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="composite-note">Note (optional)</Label>
              <Input
                id="composite-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. with a slice of lime"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={special}
                onCheckedChange={(checked) => setSpecial(checked === true)}
              />
              Special (only here for a limited time)
            </label>
          </section>

          <section className={PANEL}>
            <SectionHeading
              icon={BlendIcon}
              title="Components"
              description="What goes in, in portions of each item."
            />

            {lines.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                Nothing in it yet. Search below to add an item.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {lines.map((line, index) => {
                  const option = options.get(line.componentId);
                  const quantity = parseTypedNumber(line.quantity);
                  return (
                    <li
                      key={line.componentId}
                      className="flex items-center gap-2 px-2.5 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {option?.name ?? "Unknown item"}
                        </p>
                        <p
                          className={cn(
                            "text-xs text-muted-foreground",
                            option?.archived && "text-destructive",
                          )}
                        >
                          {option?.archived ? "Archived · " : ""}
                          {formatPrice(option?.salePrice)} · cost{" "}
                          {formatPrice(option?.cost)}
                        </p>
                      </div>
                      <Input
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((current) =>
                            current.map((other, i) =>
                              i === index
                                ? { ...other, quantity: e.target.value }
                                : other,
                            ),
                          )
                        }
                        inputMode="decimal"
                        aria-label={`Quantity of ${option?.name}`}
                        className="h-7 w-14 px-1.5 text-right tabular-nums"
                      />
                      <span className="w-16 text-right text-sm tabular-nums">
                        {option?.salePrice != null && quantity != null
                          ? formatPrice(option.salePrice * quantity)
                          : "—"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Take out ${option?.name}`}
                        onClick={() =>
                          setLines((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <XIcon />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="space-y-2">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter adds the first match instead of saving the form.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (results[0]) add(results[0]);
                    }
                  }}
                  placeholder="Add an item…"
                  aria-label="Search our items to add"
                  className="pl-8"
                />
              </div>
              {results.length > 0 && (
                <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">
                  {results.map((option) => (
                    <li key={option.id}>
                      <button
                        type="button"
                        onClick={() => add(option)}
                        className="flex w-full items-baseline justify-between gap-3 px-2.5 py-1.5 text-left hover:bg-muted/60"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {option.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {option.categoryName}
                          </span>
                        </span>
                        <span className="text-sm tabular-nums">
                          {formatPrice(option.salePrice)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {term.length > 0 && results.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No items found.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Sum</p>
                <p className="font-medium tabular-nums">{formatPrice(sum)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cost</p>
                <p className="font-medium tabular-nums">{formatPrice(cost)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current price</p>
                <p
                  className={cn(
                    "font-medium tabular-nums",
                    pricesDiffer(price, sum) &&
                      "text-amber-700 dark:text-amber-400",
                  )}
                >
                  {formatPrice(price)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Margin</p>
                <p className="font-medium tabular-nums">
                  {formatPercent(
                    price && cost != null ? margin(price, cost) : null,
                  )}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              The sum is what the components sell for together. The price
              itself is set in the pricing table, like any other.
            </p>

            {item && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Sale price history</p>
                {data.salePriceHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No changes yet.
                  </p>
                ) : (
                  <SalePriceHistoryList
                    history={data.salePriceHistory}
                    className="max-h-40 overflow-y-auto"
                  />
                )}
              </div>
            )}
          </section>
        </div>

        <ItemDialogFooter
          item={item}
          pending={pending}
          startTransition={startTransition}
          onClose={onClose}
          addLabel="Add composite"
        />
      </form>
    </>
  );
}
