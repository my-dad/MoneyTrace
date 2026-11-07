import type { AccountRow, BalanceRow, ExpenseEntryRow, FollowUpRow } from "../../shared/read-model-gateway";

export const SYSTEM_CASH_ACCOUNT_ID = "cash-unassigned";

export type HomeViewModel = {
  availableMinor: number;
  cashMinor: number;
  cardDuesMinor: number;
  spendingThisMonthMinor: number;
  unexplainedCashMinor: number;
  dueFollowUps: FollowUpRow[];
  accountLabels: { accountId: string; label: string }[];
  freshnessAtMs: number;
};

function offsetAt(instantMs: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(instantMs));
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  const localAsUtc = Date.UTC(values.year ?? 0, (values.month ?? 1) - 1, values.day ?? 1, values.hour ?? 0, values.minute ?? 0, values.second ?? 0);
  return localAsUtc - instantMs;
}

export function monthRangeInZone(nowMs: number, timezone: string): { fromMs: number; toMs: number } {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit" });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(nowMs)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  const year = parts.year ?? 1970;
  const month = parts.month ?? 1;
  const startUtc = Date.UTC(year, month - 1, 1);
  const nextUtc = Date.UTC(year, month, 1);
  const fromMs = startUtc - offsetAt(startUtc, timezone);
  const nextMs = nextUtc - offsetAt(nextUtc, timezone);
  return { fromMs, toMs: nextMs - 1 };
}

export function buildHomeViewModel(input: { accounts: AccountRow[]; balances: BalanceRow[]; followUps: FollowUpRow[]; expenseEntries: ExpenseEntryRow[]; nowMs: number }): HomeViewModel {
  const balances = new Map(input.balances.map((balance) => [balance.accountId, balance]));
  const amount = (kind: BalanceRow["accountKind"]): number => input.balances.filter((balance) => balance.accountKind === kind).reduce((sum, balance) => sum + balance.debitMinusCreditMinor, 0);
  const cashMinor = amount("cash") + amount("familyCash");
  const availableMinor = amount("bank") + cashMinor;
  const cardDuesMinor = Math.max(0, -amount("creditLiability"));
  const unexplainedCashMinor = Math.max(0, balances.get(SYSTEM_CASH_ACCOUNT_ID)?.debitMinusCreditMinor ?? 0);
  const spendingThisMonthMinor = input.expenseEntries.reduce((sum, entry) => sum + (entry.side === "debit" ? entry.amountMinor : -entry.amountMinor), 0);
  const dueFollowUps = input.followUps.filter((followUp) => followUp.state === "open" && followUp.dueAtMs <= input.nowMs);
  const accountLabels = input.accounts.filter((account) => account.kind === "familyCash").map((account) => ({ accountId: account.id, label: account.name }));
  const freshnessAtMs = Math.max(0, ...input.balances.map((balance) => balance.updatedAtMs), ...input.accounts.map((account) => account.createdAtMs), ...input.expenseEntries.map((entry) => entry.occurredAtMs));
  return { availableMinor, cashMinor, cardDuesMinor, spendingThisMonthMinor, unexplainedCashMinor, dueFollowUps, accountLabels, freshnessAtMs };
}
