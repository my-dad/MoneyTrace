import type { PurchaseIntent, PostingStrategy } from "../intents";
import { credit, debit, requireKind, requirePositive } from "./shared";
import { nominal } from "../../ledger/account-ref";
export const purchaseStrategy: PostingStrategy<PurchaseIntent> = {
  type: "purchase",
  toEntries(i) {
    requirePositive(i.amount);
    requireKind(i.funding, "funding", "bank", "cash", "familyCash");
    return [
      debit(nominal.expense(i.category, i.amount.currency), i.amount),
      credit(i.funding, i.amount),
    ];
  },
};
