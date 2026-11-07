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

/**
 * Applies to every new posting, not only imports: entries on a real account that has a stored
 * marker must be dated strictly after it. An account without a marker passes unless
 * `requireMarker` is set (imports always set it).
 */
export function assertPostingAfterCutover(
  entries: readonly EntryDraft[],
  occurredAt: LedgerDate,
  markers: readonly CutoverMarker[],
  requireMarker: boolean,
): void {
  for (const e of entries) {
    if (!isRealAccount(e.account)) continue;
    const marker = markers.find((m) => m.accountId === e.account.id);
    if (marker === undefined) {
      if (requireMarker) throw new DomainError("beforeCutover", "account has no cutover marker");
      continue;
    }
    if (!occurredAt.isAfter(marker.effectiveAt)) {
      throw new DomainError("beforeCutover", "posting is at or before the account cutover");
    }
  }
}
