import type { IncomeIntent, PostingStrategy } from "../intents";
import { credit, debit, requireKind, requirePositive } from "./shared";
import { nominal } from "../../ledger/account-ref";
export const incomeStrategy: PostingStrategy<IncomeIntent> = {
  type: "income",
  toEntries(i) {
    requirePositive(i.amount);
    requireKind(i.destination, "destination", "bank", "cash");
    return [
      debit(i.destination, i.amount),
      credit(nominal.income(i.category, i.amount.currency), i.amount),
    ];
  },
};
