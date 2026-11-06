import type { AccountRef } from "../ledger/account-ref";
import type { CutoverMarker } from "../ledger/cutover";
import type { EntryDraft } from "../ledger/entry";
import type { LedgerDate } from "../ledger-date";
import type { Money } from "../money";

export type WithdrawalIntent = {
  type: "withdrawal";
  bank: AccountRef;
  cash: AccountRef;
  amount: Money;
};
export type TransferIntent = { type: "transfer"; from: AccountRef; to: AccountRef; amount: Money };
export type PurchaseIntent = {
  type: "purchase";
  funding: AccountRef;
  category: string;
  amount: Money;
};
export type CardPurchaseIntent = {
  type: "cardPurchase";
  card: AccountRef;
  category: string;
  amount: Money;
};
export type CardRepaymentIntent = {
  type: "cardRepayment";
  bank: AccountRef;
  card: AccountRef;
  amount: Money;
};
export type IncomeIntent = {
  type: "income";
  destination: AccountRef;
  category: string;
  amount: Money;
};
export type FeeIntent = { type: "fee"; charged: AccountRef; amount: Money };
export type RefundIntent = { type: "refund"; target: AccountRef; category: string; amount: Money };
export type AdjustmentIntent = {
  type: "adjustment";
  account: AccountRef;
  direction: "increase" | "decrease";
  amount: Money;
  cause: string;
  authorizedBy: string;
};
export type OpeningBalanceIntent = {
  type: "openingBalance";
  account: AccountRef;
  /** Signed: negative means an overdraft or a credit balance. */
  amount: Money;
  effectiveAt: LedgerDate;
};
export type CashCustodyTransferIntent = {
  type: "cashCustodyTransfer";
  from: AccountRef;
  to: AccountRef;
  amount: Money;
  holderName: string;
};
export type HistoricalImportIntent = {
  type: "historicalImport";
  inner: PostingIntent;
  occurredAt: LedgerDate;
  cutovers: readonly CutoverMarker[];
};

export type PostingIntent =
  | WithdrawalIntent
  | TransferIntent
  | PurchaseIntent
  | CardPurchaseIntent
  | CardRepaymentIntent
  | IncomeIntent
  | FeeIntent
  | RefundIntent
  | AdjustmentIntent
  | OpeningBalanceIntent
  | CashCustodyTransferIntent
  | HistoricalImportIntent;

export type PostingStrategy<I extends PostingIntent> = {
  type: I["type"];
  toEntries(intent: I, ctx: { delegate(i: PostingIntent): EntryDraft[] }): EntryDraft[];
};
