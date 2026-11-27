import { describe, expect, it } from "vitest";
import { categoryOf, dhakaDay, monthRange, netOf, sameTimeLastMonthMs, sectorTotals, type FigureEntry } from "./figures";

/** A wall-clock time in Dhaka (UTC+6) as an instant. */
const dhaka = (y: number, m: number, d: number, h = 12): number => Date.UTC(y, m - 1, d, h - 6);

const entry = (accountId: string, side: "debit" | "credit", amountMinor: number, id = "t1"): FigureEntry => ({
  transactionId: id,
  accountId,
  side,
  amountMinor,
  occurredAtMs: dhaka(2026, 11, 3),
});

describe("figures", () => {
  it("clamps the same time last month to that month's last day", () => {
    expect(sameTimeLastMonthMs(dhaka(2026, 3, 31, 15))).toBe(dhaka(2026, 2, 28, 15));
  });

  it("nets a refund against its sector and leaves out a sector at zero or below", () => {
    const totals = sectorTotals([
      entry("nominal:expense:food:BDT", "debit", 30000),
      entry("nominal:expense:food:BDT", "credit", 10000, "t2"),
      entry("nominal:expense:transport:BDT", "debit", 5000, "t3"),
      entry("nominal:expense:transport:BDT", "credit", 5000, "t4"),
      entry("nominal:expense:groceries:BDT", "debit", 40000, "t5"),
    ]);
    expect(totals).toEqual([
      { sector: "groceries", amountMinor: 40000 },
      { sector: "food", amountMinor: 20000 },
    ]);
  });

  it("reads older category names as today's sectors", () => {
    expect(categoryOf("nominal:expense:eating-out:BDT")).toBe("food");
    expect(categoryOf("expense-groceries")).toBe("groceries");
  });

  it("nets debits against credits", () => {
    expect(netOf([entry("a", "debit", 500), entry("a", "credit", 200, "t2")], "debit")).toBe(300);
    expect(netOf([entry("a", "debit", 500), entry("a", "credit", 200, "t2")], "credit")).toBe(-300);
  });

  it("gives the Dhaka calendar day", () => {
    expect(dhakaDay(Date.parse("2026-11-26T18:30:00Z"))).toBe("2026-11-27");
    expect(dhakaDay(Date.parse("2026-11-26T17:59:00Z"))).toBe("2026-11-26");
  });

  it("names the month before", () => {
    expect(monthRange(dhaka(2026, 11, 6), -1).label).toBe("October 2026");
    expect(monthRange(dhaka(2026, 11, 6), 0).fromMs).toBe(dhaka(2026, 11, 1, 0));
  });
});
