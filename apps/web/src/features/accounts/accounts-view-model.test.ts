import { describe, expect, it } from "vitest";
import { FIXTURE_ACCOUNTS, FIXTURE_BALANCES } from "../../shared/fixtures/household";
import { accountTotals, cashDifference, dueLabel, groupAccounts } from "./accounts-view-model";

describe("groupAccounts", () => {
  const groups = groupAccounts(FIXTURE_ACCOUNTS, FIXTURE_BALANCES);

  it("groups accounts in the order bank, cash, family-held, cards", () => {
    expect(groups.map((group) => group.kind)).toEqual(["bank", "cash", "familyCash", "creditLiability"]);
    expect(groups.map((group) => group.totalMinor)).toEqual([12_550_000, 2_020_000, 450_000, 2_457_000]);
  });

  it("shows card amounts owed as positive", () => {
    const cards = groups.find((group) => group.kind === "creditLiability");
    expect(cards?.rows.map((row) => row.amountMinor)).toEqual([1_845_000, 612_000]);
  });

  it("marks only cash-unassigned as unexplained, listed last in Cash", () => {
    const flagged = groups.flatMap((group) => group.rows).filter((row) => row.unexplained);
    expect(flagged.map((row) => row.id)).toEqual(["cash-unassigned"]);
    expect(groups.find((group) => group.kind === "cash")?.rows.at(-1)?.id).toBe("cash-unassigned");
  });

  it("hides unexplained cash when there is none, and skips empty groups", () => {
    const only = groupAccounts(
      FIXTURE_ACCOUNTS.filter((account) => account.id === "cash-unassigned" || account.id === "bank-dbbl"),
      FIXTURE_BALANCES.map((row) => (row.accountId === "cash-unassigned" ? { ...row, debitMinusCreditMinor: 0 } : row)),
    );
    expect(only.map((group) => group.kind)).toEqual(["bank"]);
  });

  it("totals available money apart from card dues", () => {
    expect(accountTotals(groups)).toEqual({ availableMinor: 15_020_000, owedMinor: 2_457_000 });
  });
});

describe("cashDifference", () => {
  it("computes the cash count difference", () => {
    expect(cashDifference(800_000, 770_000)).toBe(-30_000);
    expect(cashDifference(800_000, 800_000)).toBe(0);
    expect(cashDifference(800_000, 810_050)).toBe(10_050);
  });
});

describe("dueLabel", () => {
  it("formats a due date as day and month", () => {
    expect(dueLabel("2026-11-15")).toBe("15 Nov");
  });
});
