import { describe, expect, it } from "vitest";
import { isDueForCheck, newExpiry, safeNextPath } from "./rules";

describe("safeNextPath", () => {
  it("keeps paths on this site", () => {
    expect(safeNextPath("/orders/12?tab=lines")).toBe("/orders/12?tab=lines");
  });

  it("falls back to the start page", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("refuses other hosts", () => {
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
  });
});

describe("isDueForCheck", () => {
  const now = new Date("2026-11-16T12:00:00Z");

  it("waits 15 minutes after the last check", () => {
    expect(isDueForCheck(new Date("2026-11-16T11:50:00Z"), now)).toBe(false);
    expect(isDueForCheck(new Date("2026-11-16T11:45:00Z"), now)).toBe(true);
  });
});

describe("newExpiry", () => {
  it("is 30 days out", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    expect(newExpiry(now).toISOString()).toBe("2026-12-16T12:00:00.000Z");
  });
});
