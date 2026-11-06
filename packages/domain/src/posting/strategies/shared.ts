import { DomainError } from "../../errors";
import type { AccountKind, AccountRef } from "../../ledger/account-ref";
import type { EntryDraft } from "../../ledger/entry";
import type { Money } from "../../money";

export const invalid = (msg: string): DomainError => new DomainError("invalidIntent", msg);

export function requirePositive(amount: Money): void {
  if (!amount.isPositive()) throw invalid("amount must be positive");
}

export function requireKind(ref: AccountRef, what: string, ...kinds: AccountKind[]): void {
  if (!kinds.includes(ref.kind)) throw invalid(`${what} must be ${kinds.join(" or ")}`);
}

export function requireNonBlank(s: string, what: string): void {
  if (typeof s !== "string" || s.trim() === "") throw invalid(`${what} must not be blank`);
}

export const debit = (account: AccountRef, amount: Money): EntryDraft => ({
  account,
  side: "debit",
  amount,
});
export const credit = (account: AccountRef, amount: Money): EntryDraft => ({
  account,
  side: "credit",
  amount,
});
