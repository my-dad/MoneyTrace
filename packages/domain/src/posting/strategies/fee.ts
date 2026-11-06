import type { FeeIntent, PostingStrategy } from "../intents";
import { credit, debit, requireKind, requirePositive } from "./shared";
import { nominal } from "../../ledger/account-ref";
export const feeStrategy: PostingStrategy<FeeIntent> = {
  type: "fee",
  toEntries(i) {
    requirePositive(i.amount);
    requireKind(i.charged, "charged account", "bank", "creditLiability");
    return [
      debit(nominal.expense("fees", i.amount.currency), i.amount),
      credit(i.charged, i.amount),
    ];
  },
};
