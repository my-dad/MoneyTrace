import type { CardRepaymentIntent, PostingStrategy } from "../intents";
import { credit, debit, requireKind, requirePositive } from "./shared";

export const cardRepaymentStrategy: PostingStrategy<CardRepaymentIntent> = {
  type: "cardRepayment",
  toEntries(i) {
    requirePositive(i.amount);
    requireKind(i.bank, "bank", "bank");
    requireKind(i.card, "card", "creditLiability");
    return [debit(i.card, i.amount), credit(i.bank, i.amount)];
  },
};
