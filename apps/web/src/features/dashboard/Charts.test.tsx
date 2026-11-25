/** @vitest-environment jsdom */

import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtureReadModels } from "../../shared/fixtures/fixture-read-models";
import { FIXTURE_EXPENSE_ENTRIES, FIXTURE_NOW_MS } from "../../shared/fixtures/household";
import { DashboardScreen } from "./DashboardScreen";

afterEach(cleanup);

const show = (gateway = createFixtureReadModels()) => {
  render(<DashboardScreen gateway={gateway} nowMs={FIXTURE_NOW_MS} displayName="Demo" onSignOut={vi.fn(() => Promise.resolve())} />);
  return gateway;
};

describe("dashboard charts", () => {
  it("shows the four charts", () => {
    show();
    for (const name of ["Where it went", "Day by day", "Came in vs Spent", "Top shops"]) {
      expect(screen.getByRole("region", { name })).toBeTruthy();
    }
  });

  it("says which sector takes the most, with a table of every sector", () => {
    show();
    const sectors = screen.getByRole("region", { name: "Where it went" });
    expect(within(sectors).getByText("Groceries took 37% of spending")).toBeTruthy();
    expect(within(sectors).getByRole("img", { name: /Spending by sector/ })).toBeTruthy();
    const table = within(sectors).getByRole("table");
    expect(within(table).getAllByRole("row").map((r) => r.textContent)).toEqual(
      expect.arrayContaining(["Groceries৳6,82037%", "Not sorted yet৳2,50013%"]),
    );
  });

  it("updates when a new spend is recorded, without reloading", () => {
    const gateway = show();
    act(() => {
      gateway.setExpenseEntries([
        ...FIXTURE_EXPENSE_ENTRIES,
        { id: "big:1", transactionId: "big", accountId: "expense-food", accountKind: "expense", side: "debit", amountMinor: 3_000_000, currency: "BDT", occurredAtMs: FIXTURE_NOW_MS - 60_000 },
      ]);
    });
    expect(within(screen.getByRole("region", { name: "Where it went" })).getByText(/^Food took \d+% of spending$/)).toBeTruthy();
  });

  it("with no spending this month says so and draws nothing", () => {
    const gateway = createFixtureReadModels();
    gateway.setExpenseEntries(FIXTURE_EXPENSE_ENTRIES.filter((e) => e.occurredAtMs < Date.parse("2026-11-01T00:00:00+06:00")));
    show(gateway);
    const sectors = screen.getByRole("region", { name: "Where it went" });
    expect(within(sectors).getByText("No spending yet this month")).toBeTruthy();
    expect(within(sectors).queryByRole("img")).toBeNull();
  });

  it("day by day ends at today's total and compares with last month", () => {
    show();
    const daily = screen.getByRole("region", { name: "Day by day" });
    expect(within(daily).getByText("৳18,640 by 6 Nov · ৳1,740 more than this time last month")).toBeTruthy();
    expect(within(daily).getAllByRole("row")).toHaveLength(7);
    // The axis runs to the shown month's last day, not last month's.
    expect(within(daily).getByText("30 Nov")).toBeTruthy();
  });

  it("Came in vs Spent covers six months", () => {
    show();
    const months = screen.getByRole("region", { name: "Came in vs Spent" });
    const rows = within(within(months).getByRole("table")).getAllByRole<HTMLTableRowElement>("row").slice(1);
    expect(rows.map((r) => r.cells[0]?.textContent)).toEqual(["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"]);
    expect(rows[5]?.textContent).toBe("Nov৳85,000৳18,640");
  });

  it("Top shops lists the shops taking the most", () => {
    show();
    const shops = screen.getByRole("region", { name: "Top shops" });
    expect(within(shops).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Shwapno GulshanGroceries৳3,350",
      "DarazNot sorted yet৳2,500",
      "No shop namedOther৳2,230",
      "Agora DhanmondiGroceries৳1,870",
      "PathaoTransport৳1,750",
    ]);
  });
});
