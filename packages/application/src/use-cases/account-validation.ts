import {
  DomainError,
  isRealAccount,
  type AccountRef,
  type EntryDraft,
  type OwnerId,
} from "@moneytrace/domain";
import type { AccountRepository } from "../ports/account-repository";

const widen = (s: string): string => s;

/**
 * Every real account touched must exist for this owner, be active, and match in kind and
 * currency. Missing, closed, mismatched and foreign accounts are all `accountInvalid`.
 */
export async function assertAccountsUsable(
  accounts: AccountRepository,
  ownerId: OwnerId,
  entries: readonly EntryDraft[],
): Promise<void> {
  const refs = new Map<string, AccountRef>();
  for (const e of entries) {
    if (isRealAccount(e.account)) refs.set(e.account.id, e.account);
  }
  if (refs.size === 0) return;
  const found = new Map(
    (
      await accounts.getMany(
        ownerId,
        [...refs.values()].map((r) => r.id),
      )
    ).map((r) => [r.id, r]),
  );
  for (const ref of refs.values()) {
    const record = found.get(ref.id);
    if (
      record === undefined ||
      record.status !== "active" ||
      widen(record.kind) !== widen(ref.kind) ||
      widen(record.currency) !== widen(ref.currency)
    ) {
      throw new DomainError("accountInvalid", "account is missing, closed or does not match");
    }
  }
}
