import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import { describe, expect, it } from "vitest";
import { createFixtureReadModels } from "./fixture-read-models";
import {
  FIXTURE_ACCOUNTS,
  FIXTURE_AI_USAGE,
  FIXTURE_BALANCES,
  FIXTURE_EXPENSE_ENTRIES,
  FIXTURE_FOLLOW_UPS,
  FIXTURE_INCOME_ENTRIES,
  FIXTURE_NOW_MS,
  FIXTURE_SOURCE_EVENTS,
} from "./household";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const balanceOf = (kinds: string[]) =>
  sum(FIXTURE_BALANCES.filter((b) => kinds.includes(b.accountKind)).map((b) => b.debitMinusCreditMinor));

describe("fixture household", () => {
  it("every fixture row satisfies its contract schema", () => {
    FIXTURE_ACCOUNTS.forEach((row) => OWNER_COLLECTIONS.accounts.parse(row));
    FIXTURE_BALANCES.forEach((row) => OWNER_COLLECTIONS.balances.parse(row));
    FIXTURE_FOLLOW_UPS.forEach((row) => OWNER_COLLECTIONS.followUps.parse(row));
    FIXTURE_SOURCE_EVENTS.forEach((row) => OWNER_COLLECTIONS.sourceEvents.parse(row));
    FIXTURE_EXPENSE_ENTRIES.forEach((row) => OWNER_COLLECTIONS.ledgerEntries.parse(row));
  });

  it("bank balances total 1,25,500 taka", () => {
    expect(balanceOf(["bank"])).toBe(12_550_000);
  });

  it("cash balances total 24,700 taka, including 5,000 not yet explained", () => {
    expect(balanceOf(["cash", "familyCash"])).toBe(2_470_000);
    expect(FIXTURE_BALANCES.find((b) => b.accountId === "cash-unassigned")?.debitMinusCreditMinor).toBe(500_000);
  });

  it("card amounts owed total 24,570 taka", () => {
    expect(-balanceOf(["creditLiability"])).toBe(2_457_000);
  });

  it("November expenses total 18,640 taka", () => {
    const november = FIXTURE_EXPENSE_ENTRIES.filter((e) => e.occurredAtMs >= Date.parse("2026-11-01T00:00:00+06:00"));
    expect(sum(november.map((e) => e.amountMinor))).toBe(1_864_000);
    expect(FIXTURE_EXPENSE_ENTRIES.every((e) => e.side === "debit" && e.accountKind === "expense")).toBe(true);
  });

  it("covers every status the activity filters need", () => {
    const count = (status: string) => FIXTURE_SOURCE_EVENTS.filter((e) => e.status === status).length;
    expect(count("posted")).toBeGreaterThanOrEqual(6);
    expect(FIXTURE_SOURCE_EVENTS.filter((e) => e.pendingReason === "awaitingClarification")).toHaveLength(2);
    expect(count("linkedAsDuplicate")).toBe(1);
    expect(count("rejected")).toBe(1);
    expect(count("deadLetter")).toBe(1);
  });

  it("has two open follow-ups and one snoozed", () => {
    expect(FIXTURE_FOLLOW_UPS.filter((f) => f.state === "open")).toHaveLength(2);
    expect(FIXTURE_FOLLOW_UPS.filter((f) => f.state === "snoozed")).toHaveLength(1);
  });

  it("the seeded gateway delivers every collection", () => {
    const gateway = createFixtureReadModels();
    const seen: Record<string, number> = {};
    gateway.watchAccounts((rows) => (seen.accounts = rows.length));
    gateway.watchBalances((rows) => (seen.balances = rows.length));
    gateway.watchFollowUps((rows) => (seen.followUps = rows.length));
    gateway.watchSourceEvents(100, (rows) => (seen.sourceEvents = rows.length));
    gateway.watchExpenseEntries(0, Number.MAX_SAFE_INTEGER, (rows) => (seen.expenses = rows.length));
    expect(seen).toEqual({
      accounts: FIXTURE_ACCOUNTS.length,
      balances: FIXTURE_BALANCES.length,
      followUps: FIXTURE_FOLLOW_UPS.length,
      sourceEvents: FIXTURE_SOURCE_EVENTS.length,
      expenses: FIXTURE_EXPENSE_ENTRIES.length,
    });
  });

  it("has no card or account digits in account names (CR-006)", () => {
    expect(FIXTURE_ACCOUNTS.filter((a) => /\d{3,4}/.test(a.name)).map((a) => a.name)).toEqual([]);
  });

  it("has the demo October and November figures the dashboard shows", () => {
    const dhaka = (iso: string) => Date.parse(`${iso}+06:00`);
    const debits = (from: number, to: number) =>
      sum(FIXTURE_EXPENSE_ENTRIES.filter((e) => e.occurredAtMs >= from && e.occurredAtMs <= to).map((e) => (e.side === "debit" ? e.amountMinor : -e.amountMinor)));
    expect(debits(dhaka("2026-11-01T00:00:00"), FIXTURE_NOW_MS)).toBe(1_864_000);
    expect(debits(dhaka("2026-10-01T00:00:00"), dhaka("2026-10-06T20:00:00"))).toBe(1_690_000);
    expect(debits(dhaka("2026-10-01T00:00:00"), dhaka("2026-10-31T23:59:59"))).toBe(5_230_000);
    expect(sum(FIXTURE_INCOME_ENTRIES.map((e) => e.amountMinor))).toBe(8_500_000);
    expect(sum(FIXTURE_AI_USAGE.map((u) => u.actualMicroUsd ?? u.estimatedMicroUsd))).toBe(1_430_000);
    FIXTURE_INCOME_ENTRIES.forEach((row) => OWNER_COLLECTIONS.ledgerEntries.parse(row));
    FIXTURE_AI_USAGE.forEach((row) => OWNER_COLLECTIONS.aiUsage.parse(row));
  });
});
