import { describe, expect, it } from "vitest";
import {
  depositBalanceHistory,
  depositYears,
  linesInYear,
  summarizeDeposits,
  type DepositLine,
} from "./deposits";

const PRICES: Record<string, number> = {
  "8856": 30,
  "8820": 120,
  "8886": 3.9,
  "8891": 5,
  "8885": 2.6,
};

function line(
  itemNo: string,
  quantity: number,
  day = "2026-01-10",
  documentType: DepositLine["documentType"] = "invoice",
  documentNo = `${documentType}-${day}`,
): DepositLine {
  const unitPrice = PRICES[itemNo];
  return {
    documentNo,
    documentType,
    day,
    itemNo,
    description: `EMBALLAGE EURO ${unitPrice}`,
    quantity,
    unitPrice,
    amount: quantity * unitPrice,
  };
}

describe("summarizeDeposits", () => {
  it("counts charges and returns on invoices", () => {
    const { groups, balance } = summarizeDeposits([
      line("8856", 6),
      line("8856", -4, "2026-01-17"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      kind: "keg",
      label: "Kegs",
      charged: 6,
      returned: 4,
      out: 2,
      balance: 60,
    });
    expect(groups[0].rows[0]).toMatchObject({
      itemNo: "8856",
      name: "Beer keg",
      lastDay: "2026-01-17",
    });
    expect(balance).toBe(60);
  });

  it("counts a credit note as a refund, and a negative line on it as a charge", () => {
    const { groups } = summarizeDeposits([
      line("8856", 10),
      line("8856", 7, "2026-02-01", "creditmemo"),
      line("8856", -1, "2026-02-01", "creditmemo"),
    ]);
    expect(groups[0]).toMatchObject({
      charged: 11,
      returned: 7,
      out: 4,
      balance: 120,
    });
  });

  it("goes below zero when more came back than was charged", () => {
    const { groups } = summarizeDeposits([line("8891", 2), line("8891", -5)]);
    expect(groups[0]).toMatchObject({ out: -3, balance: -15 });
  });

  it("groups by kind in a fixed order and adds the money up", () => {
    const { groups, balance } = summarizeDeposits([
      line("8886", 3),
      line("8891", 1),
      line("8820", 1),
      line("8856", 1),
    ]);
    expect(groups.map((group) => group.kind)).toEqual(["keg", "co2", "crate"]);
    const crates = groups[2];
    expect(crates.rows.map((row) => row.itemNo)).toEqual(["8886", "8891"]);
    expect(crates).toMatchObject({ charged: 4, out: 4, balance: 16.7 });
    expect(balance).toBe(166.7);
  });

  it("puts unknown item numbers under Other without a name", () => {
    const { groups } = summarizeDeposits([line("8885", -4)]);
    expect(groups[0]).toMatchObject({ kind: "other", returned: 4 });
    expect(groups[0].rows[0]).toMatchObject({ name: null, unitPrice: 2.6 });
  });

  it("leaves no floating point crumbs", () => {
    const { groups } = summarizeDeposits([
      line("8886", 1),
      line("8886", 1),
      line("8886", 1),
      line("8886", -2),
    ]);
    expect(groups[0].balance).toBe(3.9);
  });

  it("is empty without lines", () => {
    expect(summarizeDeposits([])).toEqual({ groups: [], balance: 0 });
  });
});

describe("depositBalanceHistory", () => {
  const lines = [
    line("8856", 2, "2026-08-05"),
    line("8856", -1, "2026-09-20"),
    line("8820", 1, "2026-11-02"),
    line("8820", 1, "2026-11-02", "creditmemo"),
  ];

  it("keeps a running balance per period, quiet ones included", () => {
    const history = depositBalanceHistory(
      lines,
      { kind: "all" },
      "month",
      "2026-11-14",
    );
    expect(history.map(({ start, change, balance }) => ({ start, change, balance }))).toEqual([
      { start: "2026-08-01", change: 60, balance: 60 },
      { start: "2026-09-01", change: -30, balance: 30 },
      { start: "2026-10-01", change: 0, balance: 30 },
      { start: "2026-11-01", change: 0, balance: 30 },
    ]);
    expect(history[0]).toMatchObject({ label: "Aug '26", title: "August 2026" });
  });

  it("opens a later range with everything before it", () => {
    const history = depositBalanceHistory(
      lines,
      { kind: "rolling", months: 2 },
      "month",
      "2026-11-14",
    );
    expect(history.map((bucket) => bucket.balance)).toEqual([30, 30]);
  });
});

describe("year filter", () => {
  const lines = [
    line("8856", 3, "2025-12-30"),
    line("8856", -3, "2026-01-05"),
    line("8820", 1, "2026-03-01"),
    line("8891", 2, "2024-06-01"),
  ];

  it("lists the years with lines, newest first", () => {
    expect(depositYears(lines)).toEqual([2026, 2025, 2024]);
    expect(depositYears([])).toEqual([]);
  });

  it("starts a year from nothing, so an earlier charge returned in it goes below zero", () => {
    const { groups, balance } = summarizeDeposits(linesInYear(lines, 2026));
    expect(groups.map((group) => [group.kind, group.out])).toEqual([
      ["keg", -3],
      ["co2", 1],
    ]);
    expect(balance).toBe(30);
  });

  it("charts a year from zero", () => {
    const history = depositBalanceHistory(
      linesInYear(lines, 2026),
      { kind: "year", year: 2026 },
      "month",
      "2026-04-10",
    );
    expect(history.map((bucket) => bucket.balance)).toEqual([-90, -90, 30, 30]);
  });
});
