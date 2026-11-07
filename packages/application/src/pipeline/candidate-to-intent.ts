import {
  Money,
  type AccountRef,
  type CandidateTransaction,
  type CurrencyCode,
  type PostingIntent,
} from "@moneytrace/domain";

export type ResolvedAccounts = {
  source: AccountRef | null;
  destination: AccountRef | null;
  systemCash: AccountRef;
};

const DEFAULT_CATEGORY = "uncategorized";

/**
 * What a candidate means in the ledger, or null if it still needs an answer: the kind is unknown,
 * or an account it needs is not resolved. Only a supported currency reaches here.
 */
export function candidateToIntent(
  candidate: CandidateTransaction,
  { source, destination, systemCash }: ResolvedAccounts,
): PostingIntent | null {
  if (source === null) return null;
  const amount = Money.ofMinor(candidate.amountMinor, candidate.currency as CurrencyCode);
  const category = candidate.category ?? DEFAULT_CATEGORY;
  switch (candidate.kind) {
    case "withdrawal":
      return { type: "withdrawal", bank: source, cash: destination ?? systemCash, amount };
    case "cardTransaction":
      return source.kind === "creditLiability"
        ? { type: "cardPurchase", card: source, category, amount }
        : { type: "purchase", funding: source, category, amount };
    case "cardPurchase":
      return { type: "cardPurchase", card: source, category, amount };
    case "purchase":
      return { type: "purchase", funding: source, category, amount };
    case "cardRepayment":
      return destination === null
        ? null
        : { type: "cardRepayment", bank: destination, card: source, amount };
    case "income":
      return { type: "income", destination: source, category, amount };
    case "fee":
      return { type: "fee", charged: source, amount };
    case "refund":
      return { type: "refund", target: source, category, amount };
    case "transfer":
      return destination === null
        ? null
        : { type: "transfer", from: source, to: destination, amount };
    case "unclassifiedCredit":
    case "unclassifiedDebit":
      return null;
  }
}

export const isIncoming = (kind: CandidateTransaction["kind"]): boolean =>
  kind === "unclassifiedCredit" ||
  kind === "income" ||
  kind === "refund" ||
  kind === "cardRepayment";
