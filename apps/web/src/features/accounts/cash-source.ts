/** Account details and cash actions the read models don't carry yet. Fixture-only until functionality resumes. */

export type InstrumentView = { id: string; kind: "debitCard" | "creditCard" | "mobileWallet" | "bankAccount"; label: string; masked: string };

export type HistoryItem = {
  id: string;
  occurredAtMs: number;
  title: string;
  amountMinor: number;
  direction: "in" | "out" | "move";
  status: "Verified" | "Pending" | "Needs answer";
};

export type CardDue = { dueDate: string /* YYYY-MM-DD */; statementOwedMinor: number };

export type AdjustmentCause = "spentNotRecorded" | "givenToSomeone" | "countingMistake";

export type CashSource = {
  instruments(accountId: string): Promise<InstrumentView[]>;
  history(accountId: string): Promise<HistoryItem[]>;
  cardDue(accountId: string): Promise<CardDue | null>;
  recordCashCount(input: { accountId: string; countedMinor: number }): Promise<void>;
  recordAdjustment(input: { accountId: string; amountMinor: number; cause: string; note: string }): Promise<void>;
  allocateCash(input: { fromAccountId: string; toAccountId: string; amountMinor: number }): Promise<void>;
};
