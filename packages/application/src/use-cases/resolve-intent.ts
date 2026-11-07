import {
  DomainError,
  defaultPostingPolicy,
  type EntryDraft,
  type PostingIntent,
} from "@moneytrace/domain";

/**
 * Turns an intent into entries. A historical import is posted as its inner intent with a
 * required cutover marker: the writer checks the stored marker atomically, so caller-supplied
 * cutovers are never consulted. Its date must equal the transaction's date.
 */
export function resolveIntent(
  intent: PostingIntent,
  occurredAtMs: number,
): { entries: EntryDraft[]; requireCutoverMarker: boolean } {
  if (intent.type !== "historicalImport") {
    return { entries: defaultPostingPolicy.toEntries(intent), requireCutoverMarker: false };
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
  return { entries: defaultPostingPolicy.toEntries(intent.inner), requireCutoverMarker: true };
}
