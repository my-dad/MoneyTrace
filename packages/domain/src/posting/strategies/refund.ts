import type { RefundIntent, PostingStrategy } from "../intents";
import { credit, debit, invalid, requirePositive } from "./shared";
import { isRealAccount, nominal } from "../../ledger/account-ref";
export const refundStrategy: PostingStrategy<RefundIntent> = {
  type: "refund",
  toEntries(i) {
    requirePositive(i.amount);
    if (!isRealAccount(i.target)) throw invalid("refund target must be a real account");
    return [
      debit(i.target, i.amount),
      credit(nominal.expense(i.category, i.amount.currency), i.amount),
    ];
  },
};
