export type CandidateKind =
  | "withdrawal"
  | "cardTransaction"
  | "cardPurchase"
  | "cardRepayment"
  | "purchase"
  | "income"
  | "fee"
  | "refund"
  | "transfer"
  | "unclassifiedCredit"
  | "unclassifiedDebit";

/**
 * What evidence says happened, before it is validated or posted. `currency` is a plain string so a
 * foreign amount survives to the decide stage. `occurredAtMs` is null when the evidence has no date.
 */
export type CandidateTransaction = {
  kind: CandidateKind;
  amountMinor: number;
  feeMinor?: number;
  currency: string;
  occurredAtMs: number | null;
  dateOnly?: boolean;
  provider?: string;
  instrumentMask?: string;
  destinationMask?: string;
  counterparty?: string;
  category?: string;
  reference?: string;
  balanceAfterMinor?: number;
};
