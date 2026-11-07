import { describe, expect, it } from "vitest";
import { buildHomeViewModel, monthRangeInZone } from "./home-view-model";

const account = (id: string, kind: "bank" | "cash" | "familyCash" | "creditLiability", name = id) => ({
  id, kind, name, currency: "BDT" as const, status: "active" as const, createdAtMs: 1,
});
const balance = (accountId: string, accountKind: "bank" | "cash" | "familyCash" | "creditLiability", debitMinusCreditMinor: number) => ({
  accountId, accountKind, currency: "BDT" as const, debitMinusCreditMinor, version: 1, updatedAtMs: 2,
});

describe("home view model", () => {
  it("available is bank plus cash, and card dues are shown separately", () => {
    const vm = buildHomeViewModel({
      accounts: [account("bank", "bank"), account("cash", "cash"), account("card", "creditLiability")],
      balances: [balance("bank", "bank", 100_000), balance("cash", "cash", 20_000), balance("card", "creditLiability", -35_000)],
      followUps: [], expenseEntries: [], nowMs: 1_700_000_000_000,
    });
    expect(vm.availableMinor).toBe(120_000);
    expect(vm.cardDuesMinor).toBe(35_000);
  });

  it("family-held cash counts in cash and is labelled", () => {
    const vm = buildHomeViewModel({ accounts: [account("family", "familyCash", "Mom")], balances: [balance("family", "familyCash", 50_000)], followUps: [], expenseEntries: [], nowMs: 1 });
    expect(vm.cashMinor).toBe(50_000);
    expect(vm.accountLabels).toEqual([{ accountId: "family", label: "Mom" }]);
  });

  it("a liability shows as owed from its signed balance", () => {
    const vm = buildHomeViewModel({ accounts: [account("card", "creditLiability")], balances: [balance("card", "creditLiability", -12_000)], followUps: [], expenseEntries: [], nowMs: 1 });
    expect(vm.cardDuesMinor).toBe(12_000);
  });

  it("cash-unassigned is shown as not yet explained, never as spending", () => {
    const vm = buildHomeViewModel({ accounts: [account("cash-unassigned", "cash", "Cash · place not set")], balances: [balance("cash-unassigned", "cash", 500_000)], followUps: [], expenseEntries: [], nowMs: 1 });
    expect(vm.unexplainedCashMinor).toBe(500_000);
    expect(vm.spendingThisMonthMinor).toBe(0);
  });

  it("spending is expense debits minus credits, so a refund or reversal nets out", () => {
    const vm = buildHomeViewModel({ accounts: [], balances: [], followUps: [], expenseEntries: [
      { id: "a:1", transactionId: "a", accountId: "food", accountKind: "expense", side: "debit", amountMinor: 10_000, currency: "BDT", occurredAtMs: 1_700_000_000_000 },
      { id: "b:1", transactionId: "b", accountId: "food", accountKind: "expense", side: "credit", amountMinor: 2_000, currency: "BDT", occurredAtMs: 1_700_000_000_000 },
    ], nowMs: 1_700_000_000_000 });
    expect(vm.spendingThisMonthMinor).toBe(8_000);
  });

  it("the month starts at Dhaka midnight, not UTC", () => {
    expect(monthRangeInZone(Date.parse("2026-10-31T18:30:00Z"), "Asia/Dhaka").fromMs).toBe(Date.parse("2026-10-31T18:00:00Z"));
  });

  it("due follow-ups only appear on Home when due", () => {
    const vm = buildHomeViewModel({ accounts: [], balances: [], expenseEntries: [], nowMs: 100, followUps: [
      { id: "due", trigger: "withdrawalDestination", question: "Where?", dueAtMs: 100, snoozedUntilMs: null, state: "open", createdAtMs: 1, resolvedAtMs: null },
      { id: "later", trigger: "withdrawalDestination", question: "Later", dueAtMs: 101, snoozedUntilMs: null, state: "open", createdAtMs: 1, resolvedAtMs: null },
    ] });
    expect(vm.dueFollowUps.map((f) => f.id)).toEqual(["due"]);
  });
});
