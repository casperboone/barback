import { describe, expect, it } from "vitest";
import type { RustDocument } from "./matching";
import { comparePrices, toCents, type PricedLine } from "./prices";

function line(id: number, itemNo: string | null, quantity: number, unitPrice: number | null): PricedLine {
  return { id, itemNo, quantity, unitPrice };
}

// [itemNo, quantity, list price, discount %, amount, description?]
type Row = [string, number, number, number, number, string?];

function doc(documentNo: string, type: RustDocument["type"], rows: Row[]): RustDocument {
  return {
    documentNo,
    type,
    date: new Date("2026-11-03T00:00:00Z"),
    reference: null,
    lines: rows.map(([itemNo, quantity, unitPrice, discountPercent, amount, description]) => ({
      itemNo,
      quantity,
      unitPrice,
      discountPercent,
      amount,
      description: description ?? `PRODUCT ${itemNo}`,
    })),
  };
}

describe("toCents", () => {
  it("rounds away float noise", () => {
    expect(toCents(15.7)).toBe(1570);
    expect(toCents(45.99 / 3)).toBe(1533);
    expect(toCents(1.005)).toBe(101);
    expect(toCents(21.7728)).toBe(2177);
  });
});

describe("comparePrices", () => {
  it("passes a line charged what we ordered at, net of the discount", () => {
    // Eristoff on a real invoice: 17,78 less 13,78% is 15,33 a bottle.
    const result = comparePrices(
      [line(1, "368250", 3, 15.33)],
      [doc("VFC1", "invoice", [["368250", 3, 17.78, 13.78, 45.99]])]
    );
    expect(result).toEqual([]);
  });

  it("doesn't flag a catalog price with more decimals than Rust charges", () => {
    const result = comparePrices(
      [line(1, "12550791", 1, 21.7728)],
      [doc("VFC1", "invoice", [["12550791", 1, 22.68, 4, 21.77]])]
    );
    expect(result).toEqual([]);
  });

  it("flags a single cent", () => {
    const result = comparePrices(
      [line(1, "957", 2, 15.7)],
      [doc("VFC1", "invoice", [["957", 2, 19.06, 17.59, 31.42]])]
    );
    expect(result).toEqual([
      {
        id: 1,
        ordered: 15.7,
        charged: 15.71,
        perUnit: 0.01,
        quantity: 2,
        total: 0.02,
        source: "invoice",
        documentNos: ["VFC1"],
        varies: false,
      },
    ]);
  });

  it("flags it cheaper too", () => {
    const [result] = comparePrices(
      [line(1, "19", 1, 39.75)],
      [doc("WEB1", "order", [["19", 1, 45, 15, 38.25]])]
    );
    expect(result).toMatchObject({ perUnit: -1.5, total: -1.5, source: "order" });
  });

  it("goes by the invoice once it's in, not the Rust order before it", () => {
    const documents = [
      doc("WEB1", "order", [["19", 1, 40, 0, 40]]),
      doc("VFC1", "invoice", [["19", 1, 39.75, 0, 39.75]]),
    ];
    expect(comparePrices([line(1, "19", 1, 39.75)], documents)).toEqual([]);
    expect(comparePrices([line(1, "19", 1, 40)], documents)[0]).toMatchObject({
      source: "invoice",
      perUnit: -0.25,
    });
  });

  it("uses the Rust order for a product not invoiced yet", () => {
    const result = comparePrices(
      [line(1, "19", 1, 39.75), line(2, "957", 1, 15.7)],
      [
        doc("WEB1", "order", [["19", 1, 39.75, 0, 39.75], ["957", 1, 16, 0, 16]]),
        doc("VFC1", "invoice", [["19", 1, 39.75, 0, 39.75]]),
      ]
    );
    expect(result.map((row) => [row.id, row.source])).toEqual([[2, "order"]]);
  });

  it("falls back on the list price less the discount without a line total", () => {
    const documents = [doc("VFC1", "invoice", [["19", 2, 50, 20, 0]])];
    documents[0].lines[0].amount = null;
    expect(comparePrices([line(1, "19", 2, 40)], documents)).toEqual([]);
  });

  it("skips free text and lines without a price", () => {
    const result = comparePrices(
      [line(1, null, 1, null), line(2, "19", 1, null)],
      [doc("VFC1", "invoice", [["19", 1, 50, 0, 50]])]
    );
    expect(result).toEqual([]);
  });

  it("leaves out deposits, the surcharge, corrections, returns and credit notes", () => {
    const result = comparePrices(
      [line(1, "19", 1, 39.75)],
      [
        doc("VFC1", "invoice", [
          ["19", 1, 39.75, 0, 39.75],
          ["19", -1, 45, 0, -45],
          ["8856", 1, 30, 0, 30, "EMBALLAGE EURO 30,00"],
          ["8", 1, 2.5, 0, 2.5, "BRANDSTOFTOESLAG"],
          ["DIVERSE", 1, 5, 0, 5, "CORRECTIE VFC22-2107"],
        ]),
        doc("VCR1", "creditmemo", [["19", 1, 10, 0, 10]]),
      ]
    );
    expect(result).toEqual([]);
  });

  it("doesn't hold a replacement against the line it replaced", () => {
    // The line asked for 19, Rust sent 20 instead at its own price.
    const result = comparePrices(
      [line(1, "19", 2, 39.75)],
      [doc("VFC1", "invoice", [["20", 2, 55, 0, 110]])]
    );
    expect(result).toEqual([]);
  });

  it("splits a product over two lines, the rest on the last", () => {
    const result = comparePrices(
      [line(1, "19", 2, 39.75), line(2, "19", 1, 39.75)],
      [doc("VFC1", "invoice", [["19", 4, 40, 0, 160]])]
    );
    expect(result.map((row) => [row.id, row.quantity, row.total])).toEqual([
      [1, 2, 0.5],
      [2, 2, 0.5],
    ]);
  });

  it("doesn't flag a line that got none of it", () => {
    const result = comparePrices(
      [line(1, "19", 2, 39.75), line(2, "19", 1, 39.75)],
      [doc("VFC1", "invoice", [["19", 2, 40, 0, 80]])]
    );
    expect(result.map((row) => row.id)).toEqual([1]);
  });

  it("averages a price that differs between two invoices", () => {
    const [result] = comparePrices(
      [line(1, "19", 3, 39.75)],
      [
        doc("VFC1", "invoice", [["19", 2, 39.75, 0, 79.5]]),
        doc("VFC2", "invoice", [["19", 1, 42.75, 0, 42.75]]),
      ]
    );
    expect(result).toMatchObject({
      varies: true,
      perUnit: 1,
      quantity: 3,
      total: 3,
      documentNos: ["VFC1", "VFC2"],
    });
  });
});
