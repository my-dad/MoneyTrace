import { describe, expect, it } from "vitest";
import {
  FIXTURE_AI_USAGE,
  FIXTURE_BALANCES,
  FIXTURE_EXPENSE_ENTRIES,
  FIXTURE_INCOME_ENTRIES,
  FIXTURE_ACCOUNTS,
  FIXTURE_NOW_MS,
  FIXTURE_SOURCE_ENTRIES,
} from "../../shared/fixtures/household";
import type { AiUsageRow, BalanceRow, LedgerEntryRow } from "../../shared/read-model-gateway";
import { aiSpendLabel, buildDashboard, monthRange } from "./dashboard-view-model";

const NOW = FIXTURE_NOW_MS;
const inRange = (rows: LedgerEntryRow[], range: { fromMs: number; toMs: number }) =>
  rows.filter((r) => r.occurredAtMs >= range.fromMs && r.occurredAtMs <= range.toMs);

function view(offset: number, overrides: Partial<Parameters<typeof buildDashboard>[0]> = {}) {
  const month = monthRange(NOW, offset);
  const previous = monthRange(NOW, offset - 1);
  return buildDashboard({
    balances: FIXTURE_BALANCES,
    expenses: inRange(FIXTURE_EXPENSE_ENTRIES, month),
    income: inRange(FIXTURE_INCOME_ENTRIES, month),
    previousExpenses: inRange(FIXTURE_EXPENSE_ENTRIES, previous),
    nowMs: NOW,
    offset,
    previousLabel: previous.label.split(" ")[0] ?? "",
    accounts: FIXTURE_ACCOUNTS,
    sourceEntries: inRange(FIXTURE_SOURCE_ENTRIES, month),
    ...overrides,
  });
}

const entry = (accountId: string, side: "debit" | "credit", amountMinor: number, occurredAtMs = NOW - 1000): LedgerEntryRow => ({
  id: `${accountId}-${side}-${String(amountMinor)}:1`,
  transactionId: "t",
  accountId,
  accountKind: "expense",
  side,
  amountMinor,
  currency: "BDT",
  occurredAtMs,
});

const balance = (accountId: string, accountKind: BalanceRow["accountKind"], minor: number): BalanceRow => ({
  ...(FIXTURE_BALANCES[0] as BalanceRow),
  accountId,
  accountKind,
  debitMinusCreditMinor: minor,
});

describe("monthRange", () => {
  it("names and bounds Dhaka calendar months", () => {
    expect(monthRange(NOW, 0)).toEqual({
      fromMs: Date.parse("2026-11-01T00:00:00+06:00"),
      toMs: Date.parse("2026-12-01T00:00:00+06:00") - 1,
      label: "November 2026",
    });
    expect(monthRange(NOW, -2).label).toBe("September 2026");
  });

  it("counts 00:30 on the 1st in Dhaka as the new month", () => {
    const t = Date.parse("2026-11-01T00:30:00+06:00");
    const nov = monthRange(NOW, 0);
    expect(t >= nov.fromMs && t <= nov.toMs).toBe(true);
    expect(t <= monthRange(NOW, -1).toMs).toBe(false);
  });
});

describe("buildDashboard", () => {
  it("figures for November so far", () => {
    const v = view(0);
    expect(v.spentMinor).toBe(1_864_000);
    expect(v.incomeMinor).toBe(8_500_000);
    expect(v.unexplainedCashMinor).toBe(500_000);
    expect(v.categories.map((c) => c.category)).toEqual(["groceries", "other", "transport", "eating-out"]);
    expect(v.categories.map((c) => c.percent)).toEqual([100, 84, 46, 43]);
    expect(v.comparison).toBe("৳1,740 more than this time last month");
    expect(v.hasActivity).toBe(true);
  });

  it("a past month compares whole months", () => {
    const v = view(-1);
    expect(v.spentMinor).toBe(5_230_000);
    expect(v.comparison).toBeNull();
  });

  it("says less and same for the current month", () => {
    expect(view(0, { previousExpenses: [entry("expense-other", "debit", 2_000_000, Date.parse("2026-10-02T10:00:00+06:00"))] }).comparison).toBe(
      "৳1,360 less than this time last month",
    );
    expect(view(0, { previousExpenses: [entry("expense-other", "debit", 1_864_000, Date.parse("2026-10-02T10:00:00+06:00"))] }).comparison).toBe(
      "Same as this time last month",
    );
  });

  it("leaves out a category whose refunds exceed its spending, and keeps Spent signed", () => {
    const v = view(0, { expenses: [entry("expense-groceries", "debit", 1_000), entry("expense-groceries", "credit", 3_000)] });
    expect(v.categories).toEqual([]);
    expect(v.spentMinor).toBe(-2_000);
  });

  it("net money is everything in minus everything out across all sources (CR-008)", () => {
    expect(view(0).netMoneyMinor).toBe(12_563_000);
    expect(view(0, { balances: [balance("card-a", "creditLiability", -1_845_000), balance("bank-a", "bank", 2_000_000)] }).netMoneyMinor).toBe(155_000);
  });

  it("lists each source's money in and out this month, the system wallet left out", () => {
    expect(view(0).sources).toEqual([
      { accountId: "bank-dbbl", label: "DBBL Savings", inMinor: 8_500_000, outMinor: 1_500_000 },
      { accountId: "card-amex", label: "City Bank Amex", inMinor: 0, outMinor: 215_000 },
      { accountId: "bank-bkash", label: "bKash", inMinor: 1_000_000, outMinor: 95_000 },
      { accountId: "cash-wallet", label: "Wallet", inMinor: 0, outMinor: 65_000 },
    ]);
  });

  it("a corrected transaction counts once in its sources, not three times (CR-008)", () => {
    const leg = (transactionId: string, accountId: string, side: "debit" | "credit"): LedgerEntryRow => ({ ...entry(accountId, side, 170_000), id: `${transactionId}:${accountId}`, transactionId, accountKind: "bank" });
    const sourceEntries = [
      leg("txn-a", "bank-x", "credit"),
      leg("txn-a:rev", "bank-x", "debit"),
      leg("txn-a:repl", "bank-x", "credit"),
      leg("txn-a:repl", "bank-y", "debit"),
    ];
    expect(view(0, { sourceEntries, accounts: [] }).sources).toEqual([
      { accountId: "bank-x", label: "bank-x", inMinor: 0, outMinor: 170_000 },
      { accountId: "bank-y", label: "bank-y", inMinor: 170_000, outMinor: 0 },
    ]);
  });

  it("hides negative unexplained cash", () => {
    expect(view(0, { balances: [balance("cash-unassigned", "cash", -100)] }).unexplainedCashMinor).toBe(0);
  });


  it("hasActivity is false with no entries", () => {
    expect(view(0, { expenses: [], income: [] }).hasActivity).toBe(false);
  });
});

describe("aiSpendLabel", () => {
  it("sums actual, falling back to estimate", () => {
    const base = FIXTURE_AI_USAGE[0] as AiUsageRow;
    const estimateOnly: AiUsageRow = { ...base, estimatedMicroUsd: 430_000 };
    delete estimateOnly.actualMicroUsd;
    expect(aiSpendLabel([{ ...base, actualMicroUsd: 1_000_000 }, estimateOnly])).toBe("$1.43 used this month");
    expect(aiSpendLabel(FIXTURE_AI_USAGE)).toBe("$1.43 used this month");
  });
});
