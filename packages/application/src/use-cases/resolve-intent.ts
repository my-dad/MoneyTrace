import {
  DomainError,
  defaultPostingPolicy,
  isRealAccount,
  type AccountId,
  type EntryDraft,
  type OwnerId,
  type PostingIntent,
} from "@moneytrace/domain";
import type { LedgerReader } from "../ports/ledger-reader";

/**
 * Turns an intent into entries. A historical import never trusts caller-supplied cutovers: they
 * are replaced by the stored markers, and its date must equal the transaction's date.
 */
export async function resolveIntent(
  reader: LedgerReader,
  ownerId: OwnerId,
  intent: PostingIntent,
  occurredAtMs: number,
): Promise<{ intent: PostingIntent; entries: EntryDraft[] }> {
  if (intent.type !== "historicalImport") {
    return { intent, entries: defaultPostingPolicy.toEntries(intent) };
  }
  if (intent.occurredAt.epochMs !== occurredAtMs) {
    throw new DomainError(
      "invalidIntent",
      "historical import date must equal the transaction date",
    );
  }
  if (intent.inner.type === "openingBalance" || intent.inner.type === "historicalImport") {
    throw new DomainError("invalidIntent", `historicalImport cannot wrap ${intent.inner.type}`);
  }
  const ids = new Set<AccountId>();
  for (const e of defaultPostingPolicy.toEntries(intent.inner)) {
    if (isRealAccount(e.account)) ids.add(e.account.id);
  }
  const cutovers = ids.size > 0 ? await reader.getCutoverMarkers(ownerId, [...ids]) : [];
  const stored: PostingIntent = { ...intent, cutovers };
  return { intent: stored, entries: defaultPostingPolicy.toEntries(stored) };
}
