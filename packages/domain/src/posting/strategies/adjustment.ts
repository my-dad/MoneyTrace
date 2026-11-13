import type { AdjustmentIntent, PostingStrategy } from "../intents";
import { credit, debit, invalid, requireNonBlank, requirePositive } from "./shared";
import { isRealAccount, nominal, type AccountRef } from "../../ledger/account-ref";
import type { EntryDraft } from "../../ledger/entry";
import type { Money } from "../../money";

/** The entry on one real account; assets rise on debit, liabilities on credit. */
function leg(account: AccountRef, amount: Money, direction: AdjustmentIntent["direction"]): EntryDraft {
  requirePositive(amount);
  if (!isRealAccount(account)) throw invalid("adjustment account must be a real account");
  const liability = account.kind === "creditLiability";
  const debited = liability ? direction === "decrease" : direction === "increase";
  return debited ? debit(account, amount) : credit(account, amount);
}

export const adjustmentStrategy: PostingStrategy<AdjustmentIntent> = {
  type: "adjustment",
  toEntries(i) {
    requireNonBlank(i.cause, "cause");
    requireNonBlank(i.authorizedBy, "authorizedBy");
    const legs = [leg(i.account, i.amount, i.direction)];
    if (i.also !== undefined) {
      if (i.also.account.id === i.account.id) throw invalid("adjust two different accounts");
      legs.push(leg(i.also.account, i.also.amount, i.direction));
    }
    // Equity takes the opposite side of the legs, one entry per side, so the posting balances.
    const equity = nominal.adjustmentEquity(i.amount.currency);
    const total = (side: "debit" | "credit"): Money | null =>
      legs.filter((l) => l.side === side).reduce<Money | null>((sum, l) => (sum === null ? l.amount : sum.add(l.amount)), null);
    const legDebits = total("debit");
    const legCredits = total("credit");
    return [
      ...(legCredits === null ? [] : [debit(equity, legCredits)]),
      ...legs.filter((l) => l.side === "debit"),
      ...legs.filter((l) => l.side === "credit"),
      ...(legDebits === null ? [] : [credit(equity, legDebits)]),
    ];
  },
};
