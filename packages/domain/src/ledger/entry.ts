import { DomainError } from "../errors";
import { Money } from "../money";
import type { AccountRef } from "./account-ref";

export type EntryDraft = { account: AccountRef; side: "debit" | "credit"; amount: Money };

// CurrencyCode is a single-member union today; widen so comparisons stay valid when more are added.
const widen = (c: string): string => c;

const unbalanced = (msg: string): DomainError => new DomainError("unbalancedEntries", msg);

export function assertBalanced(entries: readonly EntryDraft[]): void {
  const first = entries[0];
  if (entries.length < 2 || first === undefined) {
    throw unbalanced("a transaction needs at least two entries");
  }
  const currency = first.amount.currency;
  let debit = Money.ofMinor(0, currency);
  let credit = Money.ofMinor(0, currency);
  for (const e of entries) {
    if (!e.amount.isPositive()) throw unbalanced("entry amounts must be positive");
    if (
      widen(e.amount.currency) !== widen(currency) ||
      widen(e.account.currency) !== widen(e.amount.currency)
    ) {
      throw unbalanced("entries must share one currency");
    }
    if (e.side === "debit") debit = debit.add(e.amount);
    else credit = credit.add(e.amount);
  }
  if (!debit.equals(credit)) throw unbalanced("debits must equal credits");
}

export function reverseEntries(entries: readonly EntryDraft[]): EntryDraft[] {
  return entries.map((e) => ({
    account: e.account,
    side: e.side === "debit" ? "credit" : "debit",
    amount: e.amount,
  }));
}
