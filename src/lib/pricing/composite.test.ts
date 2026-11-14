import { describe, expect, it } from "vitest";
import {
  compositeCost,
  compositeSum,
  movedComponents,
  pricesDiffer,
  sumWithPrice,
  type CompositePart,
} from "./composite";

const ginTonic: CompositePart[] = [
  { id: 1, quantity: 1, salePrice: 4.5, cost: 1.2 },
  { id: 2, quantity: 1, salePrice: 2.8, cost: 0.65 },
];

describe("compositeSum", () => {
  it("adds up the components' sale prices times their quantity", () => {
    expect(compositeSum(ginTonic)).toBe(7.3);
    expect(
      compositeSum([
        { id: 1, quantity: 2, salePrice: 4.5, cost: null },
        { id: 2, quantity: 0.5, salePrice: 2.8, cost: null },
      ]),
    ).toBe(10.4);
  });

  it("is unknown without components or with a component without a price", () => {
    expect(compositeSum([])).toBeNull();
    expect(
      compositeSum([...ginTonic, { id: 3, quantity: 1, salePrice: null, cost: 0.1 }]),
    ).toBeNull();
  });

  it("doesn't show floating point noise", () => {
    expect(
      compositeSum([
        { id: 1, quantity: 1, salePrice: 0.1, cost: null },
        { id: 2, quantity: 1, salePrice: 0.2, cost: null },
      ]),
    ).toBe(0.3);
  });
});

describe("compositeCost", () => {
  it("adds up the components' cost per portion times their quantity", () => {
    expect(compositeCost(ginTonic)).toBe(1.85);
    expect(
      compositeCost([
        { id: 1, quantity: 2, salePrice: null, cost: 1.2 },
        { id: 2, quantity: 1, salePrice: null, cost: 0.65 },
      ]),
    ).toBe(3.05);
  });

  it("is unknown when a component's cost is", () => {
    expect(compositeCost([])).toBeNull();
    expect(
      compositeCost([{ id: 1, quantity: 1, salePrice: 4.5, cost: null }]),
    ).toBeNull();
  });
});

describe("sumWithPrice", () => {
  it("is the sum with one component at another price", () => {
    expect(sumWithPrice(ginTonic, 1, 5)).toBe(7.8);
    expect(sumWithPrice(ginTonic, 2, null)).toBeNull();
  });

  it("follows the quantity of that component", () => {
    const double = [{ ...ginTonic[0], quantity: 2 }, ginTonic[1]];
    expect(sumWithPrice(double, 1, 5)).toBe(12.8);
  });

  it("leaves the sum alone for an item that isn't in it", () => {
    expect(sumWithPrice(ginTonic, 99, 10)).toBe(7.3);
  });
});

describe("pricesDiffer", () => {
  it("ignores less than half a cent", () => {
    expect(pricesDiffer(7.3, 7.3)).toBe(false);
    expect(pricesDiffer(7.3, 7.304)).toBe(false);
    expect(pricesDiffer(7.3, 7.31)).toBe(true);
    expect(pricesDiffer(7.5, 7.3)).toBe(true);
  });

  it("can't compare with an unknown price", () => {
    expect(pricesDiffer(null, 7.3)).toBe(false);
    expect(pricesDiffer(7.3, null)).toBe(false);
  });
});

describe("movedComponents", () => {
  it("finds the components priced differently than when the price was set", () => {
    const components = [
      { name: "Gin", salePrice: 5, referencePrice: 4.5 },
      { name: "Tonic", salePrice: 2.8, referencePrice: 2.8 },
      { name: "Lime", salePrice: 0.5, referencePrice: null },
      { name: "Ice", salePrice: null, referencePrice: null },
    ];
    expect(movedComponents(components).map((c) => c.name)).toEqual([
      "Gin",
      "Lime",
    ]);
  });
});
