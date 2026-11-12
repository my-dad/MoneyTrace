import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import type { z } from "zod";

export type AccountRow = z.output<typeof OWNER_COLLECTIONS.accounts>;
export type BalanceRow = z.output<typeof OWNER_COLLECTIONS.balances>;
export type FollowUpRow = z.output<typeof OWNER_COLLECTIONS.followUps>;
export type SourceEventRow = z.output<typeof OWNER_COLLECTIONS.sourceEvents>;
export type LedgerEntryRow = z.output<typeof OWNER_COLLECTIONS.ledgerEntries>;
export type ExpenseEntryRow = LedgerEntryRow;
export type AiUsageRow = z.output<typeof OWNER_COLLECTIONS.aiUsage>;

export type Watch<T> = (onValue: (rows: T[]) => void, onError?: (error: Error) => void) => () => void;

export type ReadModelGateway = {
  watchAccounts: Watch<AccountRow>;
  watchBalances: Watch<BalanceRow>;
  watchFollowUps: Watch<FollowUpRow>;
  watchSourceEvents: (limit: number, onValue: (rows: SourceEventRow[]) => void, onError?: (error: Error) => void) => () => void;
  watchExpenseEntries: (fromMs: number, toMs: number, onValue: (rows: ExpenseEntryRow[]) => void, onError?: (error: Error) => void) => () => void;
  watchIncomeEntries: (fromMs: number, toMs: number, onValue: (rows: LedgerEntryRow[]) => void, onError?: (error: Error) => void) => () => void;
  watchAiUsage: (fromMs: number, toMs: number, onValue: (rows: AiUsageRow[]) => void, onError?: (error: Error) => void) => () => void;
};
