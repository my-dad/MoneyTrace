import { categoryOf, formatBdt, monthRange, netOf, sameTimeLastMonthMs, sectorTotals, SYSTEM_CASH_ACCOUNT_ID, type SectorId } from "@moneytrace/contracts";
import type { TransactionRow, AccountRow, BalanceRow, LedgerEntryRow } from "../../shared/read-model-gateway";

// The figure rules live in contracts, shared with the server's tips; re-exported for this app.
export { categoryOf, monthRange, SYSTEM_CASH_ACCOUNT_ID };

export type CategoryRow = { category: SectorId; amountMinor: number; percent: number };

export type SourceRow = { accountId: string; label: string; inMinor: number; outMinor: number };

export type DashboardView = {
  spentMinor: number;
  incomeMinor: number;
  unexplainedCashMinor: number;
  /** Everything in minus everything out across all sources since tracking began (CR-008). */
  netMoneyMinor: number;
  /** Each source's money in and out this month, withdrawn cash with no place yet as "Cash". */
  sources: SourceRow[];
  categories: CategoryRow[];
  comparison: string | null;
  hasActivity: boolean;
};

const net = netOf;

function categoriesOf(expenses: LedgerEntryRow[]): CategoryRow[] {
  const positive = sectorTotals(expenses);
  const max = positive[0]?.amountMinor ?? 0;
  return positive.map(({ sector: category, amountMinor }) => ({ category, amountMinor, percent: Math.round((amountMinor * 100) / max) }));
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
  const cutoff = sameTimeLastMonthMs(input.nowMs);
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
  // Withdrawn cash counts in the total, so it is listed too, or the rows wouldn't add up.
  const names = new Map([...accounts.map((a): [string, string] => [a.id, a.name]), [SYSTEM_CASH_ACCOUNT_ID, "Cash"]]);
  const rows = new Map<string, SourceRow>();
  // A corrected transaction and its reversal cancel out; only the replacement counts.
  const reversed = new Set(
    entries.filter((e) => e.transactionId.endsWith(":rev")).map((e) => e.transactionId.slice(0, -":rev".length)),
  );
  for (const entry of entries) {
    if (reversed.has(entry.transactionId) || entry.transactionId.endsWith(":rev")) continue;
    const row = rows.get(entry.accountId) ?? { accountId: entry.accountId, label: names.get(entry.accountId) ?? entry.accountId, inMinor: 0, outMinor: 0 };
    if (entry.side === "debit") row.inMinor += entry.amountMinor;
    else row.outMinor += entry.amountMinor;
    rows.set(entry.accountId, row);
  }
  return [...rows.values()].sort((a, b) => b.outMinor - a.outMinor || a.label.localeCompare(b.label));
}

export type MerchantRow = { key: string; name: string; sector: SectorId; amountMinor: number };

/** Spending without a named shop: shown, but it can't be sorted by merchant. */
export const NO_SHOP = "No shop named";

/**
 * Spending per merchant, biggest first. Refunds and reversals net out; a merchant at zero or
 * below is left out. A merchant's sector is that of its latest spend.
 */
export function merchantsOf(expenses: LedgerEntryRow[], transactions: TransactionRow[]): MerchantRow[] {
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const rows = new Map<string, MerchantRow & { latestMs: number }>();
  for (const entry of expenses) {
    const tx = byId.get(entry.transactionId);
    const key = tx?.merchantKey ?? "";
    const row = rows.get(key) ?? { key, name: tx?.merchant ?? NO_SHOP, sector: categoryOf(entry.accountId), amountMinor: 0, latestMs: 0 };
    row.amountMinor += entry.side === "debit" ? entry.amountMinor : -entry.amountMinor;
    if (entry.side === "debit" && entry.occurredAtMs >= row.latestMs) {
      row.latestMs = entry.occurredAtMs;
      row.sector = categoryOf(entry.accountId);
    }
    rows.set(key, row);
  }
  return [...rows.values()]
    .filter((r) => r.amountMinor > 0)
    .sort((a, b) => b.amountMinor - a.amountMinor || a.name.localeCompare(b.name))
    .map(({ key, name, sector, amountMinor }) => ({ key, name, sector, amountMinor }));
}
