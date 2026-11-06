import type { WithdrawalIntent, PostingStrategy } from "../intents";
import { credit, debit, requireKind, requirePositive } from "./shared";

export const withdrawalStrategy: PostingStrategy<WithdrawalIntent> = {
  type: "withdrawal",
  toEntries(i) {
    requirePositive(i.amount);
    requireKind(i.bank, "bank", "bank");
    requireKind(i.cash, "cash", "cash");
    return [debit(i.cash, i.amount), credit(i.bank, i.amount)];
  },
};
