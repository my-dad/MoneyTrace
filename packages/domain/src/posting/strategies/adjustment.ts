import type { AdjustmentIntent, PostingStrategy } from "../intents";
import { credit, debit, invalid, requireNonBlank, requirePositive } from "./shared";
import { isRealAccount, nominal } from "../../ledger/account-ref";
export const adjustmentStrategy: PostingStrategy<AdjustmentIntent> = {
  type: "adjustment",
  toEntries(i) {
    requirePositive(i.amount);
    requireNonBlank(i.cause, "cause");
    requireNonBlank(i.authorizedBy, "authorizedBy");
    if (!isRealAccount(i.account)) throw invalid("adjustment account must be a real account");
    const equity = nominal.adjustmentEquity(i.amount.currency);
    const liability = i.account.kind === "creditLiability";
    // Assets rise on debit, liabilities on credit.
    const accountDebited = liability ? i.direction === "decrease" : i.direction === "increase";
    return accountDebited
      ? [debit(i.account, i.amount), credit(equity, i.amount)]
      : [debit(equity, i.amount), credit(i.account, i.amount)];
  },
};
