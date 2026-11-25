import { describe, expect, it } from "vitest";
import type { LedgerEntryRow } from "../../shared/read-model-gateway";
import { dailyCumulative, monthlyTotals, sectorSlices, topMerchants } from "./chart-models";
import { monthRange } from "./dashboard-view-model";

const dhaka = (iso: string) => Date.parse(`${iso}+06:00`);
let n = 0;
const entry = (accountId: string, side: "debit" | "credit", amountMinor: number, iso = "2026-11-03T12:00:00", kind: "expense" | "income" = "expense"): LedgerEntryRow => {
  n += 1;
  return { id: `e${String(n)}:1`, transactionId: `e${String(n)}`, accountId, accountKind: kind, side, amountMinor, currency: "BDT", occurredAtMs: dhaka(iso) };
};
const food = (minor: number, iso?: string) => entry("nominal:expense:food:BDT", "debit", minor, iso);
const NOW = dhaka("2026-11-06T20:00:00");

describe("sectorSlices", () => {
  it("is empty with no spending", () => {
    expect(sectorSlices([])).toEqual([]);
  });

  it("gives one sector the whole circle", () => {
    expect(sectorSlices([food(5_000)])).toEqual([{ sector: "food", amountMinor: 5_000, shareBp: 10_000 }]);
  });

  it("drops a sector whose refunds cover its spending: no negative slice", () => {
    const slices = sectorSlices([food(5_000), entry("nominal:expense:food:BDT", "credit", 6_000), entry("nominal:expense:transport:BDT", "debit", 1_000)]);
    expect(slices).toEqual([{ sector: "transport", amountMinor: 1_000, shareBp: 10_000 }]);
  });

  it("shares always add up to exactly 100%", () => {
    const slices = sectorSlices([food(100), entry("nominal:expense:transport:BDT", "debit", 100), entry("nominal:expense:groceries:BDT", "debit", 100)]);
    expect(slices.reduce((s, x) => s + x.shareBp, 0)).toBe(10_000);
    expect(slices.map((s) => s.shareBp).sort()).toEqual([3_333, 3_333, 3_334]);
  });

  it("folds older names and orders biggest first", () => {
    const slices = sectorSlices([entry("expense-eating-out", "debit", 300), entry("nominal:expense:groceries:BDT", "debit", 700)]);
    expect(slices.map((s) => s.sector)).toEqual(["groceries", "food"]);
  });
});

describe("dailyCumulative", () => {
  const november = monthRange(NOW, 0);

  it("adds up spending day by day in Dhaka, stopping at today", () => {
    const points = dailyCumulative([food(1_000, "2026-11-01T10:00:00"), food(500, "2026-11-03T23:30:00")], november, NOW);
    expect(points).toEqual([
      { day: 1, minor: 1_000 },
      { day: 2, minor: 1_000 },
      { day: 3, minor: 1_500 },
      { day: 4, minor: 1_500 },
      { day: 5, minor: 1_500 },
      { day: 6, minor: 1_500 },
    ]);
  });

  it("covers the whole month for a past month", () => {
    expect(dailyCumulative([], monthRange(NOW, -1), NOW)).toHaveLength(31);
  });
});

describe("monthlyTotals", () => {
  it("nets spending and income per month, corrections included", () => {
    const months = [monthRange(NOW, -1), monthRange(NOW, 0)];
    const rows = monthlyTotals(
      [food(1_000, "2026-10-10T10:00:00"), food(2_000), entry("nominal:expense:food:BDT", "credit", 2_000), food(1_500)],
      [entry("nominal:income:salary:BDT", "credit", 85_000, "2026-11-01T10:00:00", "income")],
      months,
    );
    expect(rows).toEqual([
      { label: "October 2026", inMinor: 0, outMinor: 1_000 },
      { label: "November 2026", inMinor: 85_000, outMinor: 1_500 },
    ]);
  });
});

describe("topMerchants", () => {
  it("keeps the top five", () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ key: `m${String(i)}`, name: `M${String(i)}`, sector: "food" as const, amountMinor: 700 - i }));
    expect(topMerchants(rows).map((r) => r.key)).toEqual(["m0", "m1", "m2", "m3", "m4"]);
  });
});
