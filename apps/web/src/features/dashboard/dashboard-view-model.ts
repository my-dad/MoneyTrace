import { formatBdt } from "@moneytrace/contracts";
import type { AccountRow, AiUsageRow, BalanceRow, LedgerEntryRow } from "../../shared/read-model-gateway";

/** The system wallet for withdrawn cash with no known place yet. Its balance is never spending. */
export const SYSTEM_CASH_ACCOUNT_ID = "cash-unassigned";

/** Mirrors the application quota default (packages/application/src/ports/quota-ledger.ts); web can't import application. */
export const MONTHLY_AI_LIMIT_MICRO_USD = 5_000_000;

const HOUR_MS = 3_600_000;
// Dhaka has no daylight saving: always UTC+6.
const DHAKA_OFFSET_MS = 6 * HOUR_MS;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type DhakaParts = { year: number; month: number; day: number; timeOfDayMs: number };

function dhakaParts(ms: number): DhakaParts {
  const shifted = new Date(ms + DHAKA_OFFSET_MS);
  const dayStart = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(), timeOfDayMs: ms + DHAKA_OFFSET_MS - dayStart };
}

const monthStartMs = (year: number, month: number): number => Date.UTC(year, month, 1) - DHAKA_OFFSET_MS;

export function monthRange(nowMs: number, offset: number): { fromMs: number; toMs: number; label: string } {
  const now = dhakaParts(nowMs);
  const first = new Date(Date.UTC(now.year, now.month + offset, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  return {
    fromMs: monthStartMs(year, month),
    toMs: monthStartMs(year, month + 1) - 1,
    label: `${MONTH_NAMES[month] ?? ""} ${String(year)}`,
  };
}

/** The same day-of-month and time one calendar month earlier, clamped to that month's last day. */
function oneMonthEarlier(nowMs: number): number {
  const now = dhakaParts(nowMs);
  const lastDay = new Date(Date.UTC(now.year, now.month, 0)).getUTCDate();
  return Date.UTC(now.year, now.month - 1, Math.min(now.day, lastDay)) - DHAKA_OFFSET_MS + now.timeOfDayMs;
}

export type CategoryRow = { category: string; amountMinor: number; percent: number };

export type SourceRow = { accountId: string; label: string; inMinor: number; outMinor: number };

export type DashboardView = {
  spentMinor: number;
  incomeMinor: number;
  unexplainedCashMinor: number;
  /** Everything in minus everything out across all sources since tracking began (CR-008). */
  netMoneyMinor: number;
  /** Each source's money in and out this month; the system wallet for unexplained cash is shown on its own. */
  sources: SourceRow[];
  categories: CategoryRow[];
  comparison: string | null;
  hasActivity: boolean;
};

const net = (rows: LedgerEntryRow[], positive: "debit" | "credit"): number =>
  rows.reduce((sum, row) => sum + (row.side === positive ? row.amountMinor : -row.amountMinor), 0);

function categoriesOf(expenses: LedgerEntryRow[]): CategoryRow[] {
  const totals = new Map<string, number>();
  for (const row of expenses) {
    const category = row.accountId.replace(/^expense-/, "");
    totals.set(category, (totals.get(category) ?? 0) + (row.side === "debit" ? row.amountMinor : -row.amountMinor));
  }
  const positive = [...totals].filter(([, amount]) => amount > 0).sort((a, b) => b[1] - a[1]);
  const max = positive[0]?.[1] ?? 0;
  return positive.map(([category, amountMinor]) => ({ category, amountMinor, percent: Math.round((amountMinor * 100) / max) }));
}

function comparisonLine(spentMinor: number, previous: LedgerEntryRow[], than: string): string | null {
  if (previous.length === 0) return null;
  const diff = spentMinor - net(previous, "debit");
  if (diff === 0) return `Same as ${than}`;
  return `${formatBdt(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than ${than}`;
}

export function buildDashboard(input: {
  balances: BalanceRow[];
  expenses: LedgerEntryRow[];
  income: LedgerEntryRow[];
  previousExpenses: LedgerEntryRow[];
  nowMs: number;
  offset: number;
  previousLabel: string;
  accounts: AccountRow[];
  sourceEntries: LedgerEntryRow[];
}): DashboardView {
  const balanceOf = (kinds: BalanceRow["accountKind"][]) =>
    input.balances.filter((b) => kinds.includes(b.accountKind)).reduce((sum, b) => sum + b.debitMinusCreditMinor, 0);
  const unexplained = input.balances.find((b) => b.accountId === SYSTEM_CASH_ACCOUNT_ID)?.debitMinusCreditMinor ?? 0;
  const spentMinor = net(input.expenses, "debit");
  const current = input.offset === 0;
  const cutoff = oneMonthEarlier(input.nowMs);
  const previous = current ? input.previousExpenses.filter((row) => row.occurredAtMs <= cutoff) : input.previousExpenses;
  return {
    spentMinor,
    incomeMinor: net(input.income, "credit"),
    unexplainedCashMinor: Math.max(0, unexplained),
    netMoneyMinor: balanceOf(["bank", "cash", "familyCash", "creditLiability"]),
    sources: sourcesOf(input.sourceEntries, input.accounts),
    categories: categoriesOf(input.expenses),
    comparison: comparisonLine(spentMinor, previous, current ? "this time last month" : input.previousLabel),
    hasActivity: input.expenses.length + input.income.length > 0,
  };
}

/** Money in (debits) and out (credits) per source; for a card as for a bank, a debit is money in. */
function sourcesOf(entries: LedgerEntryRow[], accounts: AccountRow[]): SourceRow[] {
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const rows = new Map<string, SourceRow>();
  for (const entry of entries) {
    if (entry.accountId === SYSTEM_CASH_ACCOUNT_ID) continue;
    const row = rows.get(entry.accountId) ?? { accountId: entry.accountId, label: names.get(entry.accountId) ?? entry.accountId, inMinor: 0, outMinor: 0 };
    if (entry.side === "debit") row.inMinor += entry.amountMinor;
    else row.outMinor += entry.amountMinor;
    rows.set(entry.accountId, row);
  }
  return [...rows.values()].sort((a, b) => b.outMinor - a.outMinor || a.label.localeCompare(b.label));
}

/** "$1.43": exact integer cents from micro-USD, truncated. */
function usd(micro: number): string {
  const cents = (micro - (micro % 10_000)) / 10_000;
  const dollars = (cents - (cents % 100)) / 100;
  return `$${String(dollars)}.${String(cents % 100).padStart(2, "0")}`;
}

export function aiSpendLabel(rows: AiUsageRow[]): string {
  const spent = rows.reduce((sum, row) => sum + (row.actualMicroUsd ?? row.estimatedMicroUsd), 0);
  return `${usd(spent)} of ${usd(MONTHLY_AI_LIMIT_MICRO_USD)} this month`;
}
