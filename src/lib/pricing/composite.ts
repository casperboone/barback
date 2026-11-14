// Composites are things we sell that are made of other items, like a
// gin-tonic: never bought, so their reference price is simply what their
// components sell for together, and their cost what those cost us together.
// Pure functions, so the screens, the actions and the tests agree.

export type CompositePart = {
  id: number;
  // Portions of the component that go in; can be a fraction.
  quantity: number;
  salePrice: number | null;
  cost: number | null;
};

// Less than half a cent apart counts as the same price.
const SAME_PRICE = 0.005;

// Sums of prices times fractions pick up floating point noise (0.1 + 0.2);
// this keeps it from showing up as a difference.
function clean(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function total(parts: CompositePart[], field: "salePrice" | "cost") {
  if (parts.length === 0) return null;
  let sum = 0;
  for (const part of parts) {
    const value = part[field];
    // One unknown part makes the whole unknown, not just lower.
    if (value == null) return null;
    sum += value * part.quantity;
  }
  return clean(sum);
}

// What the components sell for together: the composite's reference price.
export function compositeSum(parts: CompositePart[]) {
  return total(parts, "salePrice");
}

// What the components cost us together, per composite sold.
export function compositeCost(parts: CompositePart[]) {
  return total(parts, "cost");
}

// The sum as it would be if one component had another price, to show what
// setting that price does to the composites using it.
export function sumWithPrice(
  parts: CompositePart[],
  componentId: number,
  price: number | null,
) {
  return compositeSum(
    parts.map((part) =>
      part.id === componentId ? { ...part, salePrice: price } : part,
    ),
  );
}

export function pricesDiffer(a: number | null, b: number | null) {
  if (a == null || b == null) return false;
  return Math.abs(a - b) >= SAME_PRICE;
}

// The components whose price is no longer what it was when the composite's
// price was set. A component added since has no price from then.
export function movedComponents<
  T extends { salePrice: number | null; referencePrice: number | null },
>(components: T[]) {
  return components.filter((component) =>
    component.salePrice == null || component.referencePrice == null
      ? component.salePrice !== component.referencePrice
      : pricesDiffer(component.salePrice, component.referencePrice),
  );
}
