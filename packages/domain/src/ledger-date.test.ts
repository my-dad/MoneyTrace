import { describe, expect, it } from "vitest";
import { LedgerDate } from "./ledger-date";

const code = (c: string): unknown => expect.objectContaining({ code: c });

describe("LedgerDate", () => {
  it("round-trips epoch ms through ISO", () => {
    const d = LedgerDate.fromEpochMs(1_700_000_000_123);
    expect(d.toIso()).toBe("2023-11-14T22:13:20.123Z");
    expect(LedgerDate.fromIso(d.toIso()).epochMs).toBe(1_700_000_000_123);
  });

  it("parses ISO with an offset to the same instant", () => {
    expect(LedgerDate.fromIso("2024-01-01T06:00:00+06:00").toIso()).toBe(
      "2024-01-01T00:00:00.000Z",
    );
  });

  it.each([
    "2024-01-01T06:00:00",
    "2024",
    "1",
    "March 5, 2024",
    "2024-01-01",
    "2024-02-30T00:00:00Z",
    "2023-02-29T00:00:00Z",
    "2024-13-01T00:00:00Z",
    "2024-01-01T24:00:00Z",
  ])("rejects non-strict or impossible ISO %j", (bad) => {
    expect(() => LedgerDate.fromIso(bad)).toThrow(code("invalidDate"));
  });

  it("accepts a leap day", () => {
    expect(LedgerDate.fromIso("2024-02-29T00:00:00Z").toIso()).toBe("2024-02-29T00:00:00.000Z");
  });

  it("compares with isAfter", () => {
    const a = LedgerDate.fromEpochMs(1);
    const b = LedgerDate.fromEpochMs(2);
    expect(b.isAfter(a)).toBe(true);
    expect(a.isAfter(b)).toBe(false);
    expect(a.isAfter(a)).toBe(false);
  });

  it("rejects an unparseable ISO string", () => {
    expect(() => LedgerDate.fromIso("not-a-date")).toThrow(code("invalidDate"));
  });

  it.each([NaN, Infinity, 1.5, 8.64e15 + 1])("rejects epoch ms %s", (v) => {
    expect(() => LedgerDate.fromEpochMs(v)).toThrow(code("invalidDate"));
  });

  it("rejects a non-string ISO value", () => {
    expect(() => LedgerDate.fromIso(5 as unknown as string)).toThrow(code("invalidDate"));
  });

  it("is frozen", () => {
    expect(Object.isFrozen(LedgerDate.fromEpochMs(0))).toBe(true);
  });
});
