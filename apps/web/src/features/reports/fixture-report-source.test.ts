import { describe, expect, it } from "vitest";
import { FIXTURE_EXPENSE_ENTRIES } from "../../shared/fixtures/household";
import { createFixtureReportSource } from "./fixture-report-source";

describe("fixture report source", () => {
  const source = createFixtureReportSource();

  it("the current month's expenses match the household fixture", async () => {
    const report = await source.load("calendarMonth", 0);
    const fixtureTotal = FIXTURE_EXPENSE_ENTRIES.reduce((sum, entry) => sum + entry.amountMinor, 0);
    expect(report?.expenseMinor).toBe(1_864_000);
    expect(report?.expenseMinor).toBe(fixtureTotal);
    expect(report?.categories.map((row) => [row.category, row.amountMinor])).toEqual([
      ["groceries", 682_000],
      ["other", 573_000],
      ["transport", 315_000],
      ["eating-out", 294_000],
    ]);
  });

  it("unexplained cash is not included in expenses", async () => {
    const report = await source.load("calendarMonth", 0);
    expect(report?.unexplainedCashMinor).toBe(500_000);
    expect(report?.categories.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(report?.expenseMinor);
  });

  it("has data for the current and previous period of both kinds", async () => {
    expect((await source.load("salaryCycle", 0))?.expenseMinor).toBe(2_491_500);
    expect((await source.load("salaryCycle", -1))?.expenseMinor).toBe(4_602_500);
    expect((await source.load("calendarMonth", -1))?.expenseMinor).toBe(5_230_000);
  });

  it("older periods return null", async () => {
    expect(await source.load("calendarMonth", -2)).toBeNull();
    expect(await source.load("salaryCycle", -3)).toBeNull();
  });

  it("labels periods by month or salary cycle", () => {
    expect(source.period("calendarMonth", 0)).toEqual({ label: "November 2026", detail: "1–6 Nov · month so far" });
    expect(source.period("calendarMonth", -2).label).toBe("September 2026");
    expect(source.period("salaryCycle", 0)).toEqual({ label: "25 Oct – 24 Nov", detail: "Cycle so far · starts on the 25th" });
    expect(source.period("salaryCycle", -1).label).toBe("25 Sep – 24 Oct");
  });
});
