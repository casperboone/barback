import { describe, expect, it } from "vitest";
import {
  extendedExpiry,
  isPlausibleEmail,
  normalizeEmail,
  safeNextPath,
} from "./rules";

describe("safeNextPath", () => {
  it("keeps paths on this site", () => {
    expect(safeNextPath("/pricing?view=all")).toBe("/pricing?view=all");
  });

  it("falls back to the home page for anything else", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
  });
});

describe("emails", () => {
  it("compares addresses without case or stray spaces", () => {
    expect(normalizeEmail("  Bar@DWHDelft.nl ")).toBe("bar@dwhdelft.nl");
  });

  it("catches obvious typos", () => {
    expect(isPlausibleEmail("someone@gmail.com")).toBe(true);
    expect(isPlausibleEmail("someone@gmail")).toBe(false);
    expect(isPlausibleEmail("someone gmail.com")).toBe(false);
  });
});

describe("extendedExpiry", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  const inDays = (days: number) =>
    new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  it("leaves a fresh session alone", () => {
    expect(extendedExpiry(inDays(20), now)).toBeNull();
  });

  it("gives a session past its halfway point another 30 days", () => {
    expect(extendedExpiry(inDays(10), now)).toEqual(inDays(30));
  });
});
