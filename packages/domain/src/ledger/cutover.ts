import { DomainError } from "../errors";
import type { AccountId } from "../ids";
import type { LedgerDate } from "../ledger-date";
import { isRealAccount } from "./account-ref";
import type { EntryDraft } from "./entry";

export type CutoverMarker = { accountId: AccountId; effectiveAt: LedgerDate };

/** Every real account touched must have a marker, and occurredAt must be strictly after it. */
export function assertAfterCutover(
  entries: readonly EntryDraft[],
  occurredAt: LedgerDate,
  cutovers: readonly CutoverMarker[],
): void {
  for (const e of entries) {
    if (!isRealAccount(e.account)) continue;
    const marker = cutovers.find((c) => c.accountId === e.account.id);
    if (marker === undefined) {
      throw new DomainError("beforeCutover", "account has no cutover marker");
    }
    if (!occurredAt.isAfter(marker.effectiveAt)) {
      throw new DomainError("beforeCutover", "import is at or before the account cutover");
    }
  }
}
