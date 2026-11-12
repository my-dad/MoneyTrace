import type { AccountRow, BalanceRow } from "../../shared/read-model-gateway";
import { ACCOUNTS_COPY } from "../../shared/copy";

/** The system account holding cash whose place isn't known yet (for example, after an ATM withdrawal). */
export const UNEXPLAINED_CASH_ID = "cash-unassigned";

export type AccountView = { id: string; kind: AccountRow["kind"]; name: string; amountMinor: number; unexplained: boolean };

export type AccountGroup = {
  kind: AccountRow["kind"];
  title: string;
  totalMinor: number;
  rows: AccountView[];
};

const ORDER: AccountRow["kind"][] = ["bank", "cash", "familyCash", "creditLiability"];

/** Groups accounts for display. A card's amount is what is owed, so it is the negated raw balance. */
export function groupAccounts(accounts: AccountRow[], balances: BalanceRow[]): AccountGroup[] {
  const raw = new Map(balances.map((row) => [row.accountId, row.debitMinusCreditMinor]));
  return ORDER.flatMap((kind): AccountGroup[] => {
    const rows = accounts
      .filter((account) => account.kind === kind)
      .map((account): AccountView => {
        const value = raw.get(account.id) ?? 0;
        return {
          id: account.id,
          kind,
          name: account.name,
          amountMinor: kind === "creditLiability" ? -value : value,
          unexplained: account.id === UNEXPLAINED_CASH_ID,
        };
      })
      .filter((row) => !row.unexplained || row.amountMinor !== 0)
      .sort((a, b) => Number(a.unexplained) - Number(b.unexplained));
    if (rows.length === 0) return [];
    return [{ kind, title: ACCOUNTS_COPY.groupTitle[kind], totalMinor: rows.reduce((sum, row) => sum + row.amountMinor, 0), rows }];
  });
}

export function accountTotals(groups: AccountGroup[]): { availableMinor: number; owedMinor: number } {
  let availableMinor = 0;
  let owedMinor = 0;
  for (const group of groups) {
    if (group.kind === "creditLiability") owedMinor += group.totalMinor;
    else availableMinor += group.totalMinor;
  }
  return { availableMinor, owedMinor };
}

/** Counted minus expected: negative means less cash than expected. */
export function cashDifference(expectedMinor: number, countedMinor: number): number {
  return countedMinor - expectedMinor;
}

/** "2026-11-15" → "15 Nov". */
export function dueLabel(dueDate: string): string {
  return new Date(`${dueDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
