import type { CardPurchaseIntent, PostingStrategy } from "../intents";
import { credit, debit, requireKind, requirePositive } from "./shared";
import { nominal } from "../../ledger/account-ref";
export const cardPurchaseStrategy: PostingStrategy<CardPurchaseIntent> = {
  type: "cardPurchase",
  toEntries(i) {
    requirePositive(i.amount);
    requireKind(i.card, "card", "creditLiability");
    return [
      debit(nominal.expense(i.category, i.amount.currency), i.amount),
      credit(i.card, i.amount),
    ];
  },
};
