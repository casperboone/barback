import { describe, expect, it } from "vitest";
import {
  allowedGranularity,
  averagePrice,
  bucketQuantities,
  defaultGranularity,
  niceTicks,
  rangeBounds,
  toDay,
  type QuantityPoint,
} from "./quantity-history";

const TODAY = "2026-11-14"; // a Saturday

function point(day: string, quantity: number, documentNo = day): QuantityPoint {
  return { day, quantity, documentNo };
}

describe("toDay", () => {
  it("uses the day in Amsterdam, which is where invoices are dated", () => {
    // Stored as midnight in Amsterdam, which is still the day before in UTC.
    expect(toDay(new Date("2022-03-10T23:00:00Z"))).toBe("2022-03-11");
  });
});

describe("rangeBounds", () => {
  it("counts rolling ranges in whole months, this one included", () => {
    expect(rangeBounds({ kind: "rolling", months: 12 }, TODAY, null)).toEqual({
      from: "2025-12-01",
      to: TODAY,
    });
  });

  it("stops a calendar year at today", () => {
    expect(rangeBounds({ kind: "year", year: 2026 }, TODAY, null)).toEqual({
      from: "2026-01-01",
      to: TODAY,
    });
    expect(rangeBounds({ kind: "year", year: 2024 }, TODAY, null)).toEqual({
      from: "2024-01-01",
      to: "2024-12-31",
    });
  });

  it("starts everything at the first purchase", () => {
    expect(rangeBounds({ kind: "all" }, TODAY, "2019-03-05").from).toBe(
      "2019-03-05",
    );
  });
});

describe("bucketQuantities", () => {
  it("fills every month of the range, empty ones included", () => {
    const buckets = bucketQuantities(
      [point("2026-01-10", 2), point("2026-01-20", 1.5), point("2026-03-02", 4)],
      { kind: "rolling", months: 12 },
      "month",
      TODAY,
    );
    expect(buckets).toHaveLength(12);
    expect(buckets[0]).toMatchObject({ start: "2025-12-01", quantity: 0 });
    expect(buckets[1]).toMatchObject({
      start: "2026-01-01",
      label: "Jan '26",
      title: "January 2026",
      quantity: 3.5,
      documents: 2,
    });
    expect(buckets[3].quantity).toBe(4);
    expect(buckets.at(-1)?.start).toBe("2026-11-01");
  });

  it("subtracts credit notes and leaves out what falls outside", () => {
    const buckets = bucketQuantities(
      [point("2023-05-01", 6), point("2023-05-09", -2), point("2024-01-01", 9)],
      { kind: "year", year: 2023 },
      "quarter",
      TODAY,
    );
    expect(buckets.map((bucket) => bucket.quantity)).toEqual([0, 4, 0, 0]);
    expect(buckets[1].documents).toBe(2);
  });

  it("starts weeks on Monday and numbers them the ISO way", () => {
    const buckets = bucketQuantities(
      [point("2026-11-09", 1), point("2026-11-14", 2)],
      { kind: "rolling", months: 3 },
      "week",
      TODAY,
    );
    const last = buckets.at(-1)!;
    expect(last).toMatchObject({ start: "2026-11-09", quantity: 3 });
    expect(last.title).toBe("Week 46 · 9 Nov – 15 Nov 2026");
    // The first week began before September, and its days still count.
    expect(buckets[0].start).toBe("2026-08-31");
  });

  it("covers everything since the first purchase", () => {
    const buckets = bucketQuantities(
      [point("2024-02-10", 1), point("2026-06-01", 1)],
      { kind: "all" },
      "year",
      TODAY,
    );
    expect(buckets.map((bucket) => bucket.label)).toEqual(["2024", "2025", "2026"]);
  });
});

describe("averagePrice", () => {
  it("weighs each line by how many were bought", () => {
    const [bucket] = bucketQuantities(
      [
        { day: "2025-02-03", quantity: 1, amount: 20, documentNo: "A" },
        { day: "2025-02-10", quantity: 3, amount: 66, documentNo: "B" },
      ],
      { kind: "year", year: 2025 },
      "quarter",
      TODAY,
    );
    expect(averagePrice(bucket)).toBe(21.5);
    expect(bucket.lowestPrice).toBe(20);
    expect(bucket.highestPrice).toBe(22);
  });

  it("has none for a period without purchases", () => {
    const buckets = bucketQuantities(
      [{ day: "2025-02-03", quantity: 1, amount: 20, documentNo: "A" }],
      { kind: "year", year: 2025 },
      "quarter",
      TODAY,
    );
    expect(averagePrice(buckets[1])).toBeNull();
  });
});

describe("granularity", () => {
  it("skips ones that give too few or too many bars", () => {
    const year = { kind: "rolling", months: 12 } as const;
    expect(allowedGranularity(year, "year", TODAY, null)).toBe(false);
    expect(allowedGranularity(year, "week", TODAY, null)).toBe(true);
    const all = { kind: "all" } as const;
    expect(allowedGranularity(all, "week", TODAY, "2018-12-05")).toBe(false);
  });

  it("defaults to the finest that stays readable", () => {
    expect(defaultGranularity({ kind: "rolling", months: 3 }, TODAY, null)).toBe(
      "week",
    );
    expect(defaultGranularity({ kind: "rolling", months: 12 }, TODAY, null)).toBe(
      "month",
    );
    expect(defaultGranularity({ kind: "all" }, TODAY, "2018-12-05")).toBe(
      "quarter",
    );
  });
});

describe("niceTicks", () => {
  it("rounds to clean steps that cover the values", () => {
    expect(niceTicks(0, 8.6)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(niceTicks(-2, 9)).toEqual([-5, 0, 5, 10]);
  });
});
