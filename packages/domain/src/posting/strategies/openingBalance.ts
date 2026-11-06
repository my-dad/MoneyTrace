import type { OpeningBalanceIntent, PostingStrategy } from "../intents";
import { credit, debit, invalid } from "./shared";
import { isRealAccount, nominal } from "../../ledger/account-ref";
export const openingBalanceStrategy: PostingStrategy<OpeningBalanceIntent> = {
  type: "openingBalance",
  toEntries(i) {
    if (!isRealAccount(i.account)) throw invalid("opening balance account must be a real account");
    if (i.amount.isZero()) return [];
    const equity = nominal.openingEquity(i.amount.currency);
    const abs = i.amount.isNegative() ? i.amount.negate() : i.amount;
    const liability = i.account.kind === "creditLiability";
    // Positive asset debits the account; positive liability credits it. Negative flips.
    const accountDebited = liability === i.amount.isNegative();
    return accountDebited
      ? [debit(i.account, abs), credit(equity, abs)]
      : [debit(equity, abs), credit(i.account, abs)];
  },
};
