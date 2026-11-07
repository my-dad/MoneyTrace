import { DomainError, assertBalanced, type EntryDraft } from "@moneytrace/domain";
import type { EntryRecord, TransactionRecord } from "./ports/ledger-reader";
import type { CorrectionCommit, LedgerCommit } from "./ports/ledger-writer";

/** The reversal must be the stored entries with every side flipped, as a multiset. */
export function assertMirrors(
  stored: readonly EntryRecord[],
  reversal: readonly EntryDraft[],
): void {
  const key = (account: string, side: string, minor: number, currency: string): string =>
    `${account}|${side}|${String(minor)}|${currency}`;
  const want = stored
    .map((e) =>
      key(e.accountId, e.side === "debit" ? "credit" : "debit", e.amountMinor, e.currency),
    )
    .sort();
  const got = reversal
    .map((e) => key(e.account.id, e.side, e.amount.minor, e.amount.currency))
    .sort();
  if (want.length !== got.length || want.some((k, i) => k !== got[i])) {
    throw new DomainError("invalidIntent", "reversal entries must mirror the stored entries");
  }
}

const invalid = (message: string): DomainError => new DomainError("invalidIntent", message);

/**
 * The checks on a commit that need no stored state. Every LedgerWriter runs them right after
 * replay detection, so a malformed commit is refused the same way everywhere.
 */
export function assertCommitShape(c: LedgerCommit): void {
  if (c.transaction.state !== "posted") throw invalid("a commit must carry a posted transaction");
  const isOpening = c.transaction.intentType === "openingBalance";
  if (c.cutoverMarker !== undefined && !isOpening) {
    throw invalid("only an opening balance may carry a cutover marker");
  }
  if (isOpening && c.cutoverMarker === undefined) {
    throw invalid("an opening balance must carry a cutover marker");
  }
  if (c.entries.length > 0 || c.cutoverMarker === undefined) assertBalanced(c.entries);
  if (c.cutoverMarker) {
    const accountId = c.cutoverMarker.accountId;
    if (c.entries.length > 0 && !c.entries.some((e) => e.account.id === accountId)) {
      throw invalid("an opening's entries must include the marker's account");
    }
    if (c.cutoverMarker.effectiveAt.epochMs !== c.transaction.occurredAtMs) {
      throw invalid("marker date must equal the transaction date");
    }
  }
}

/**
 * The checks on a correction that need only the commit and the stored original. The original's
 * own state is checked by the writer before this runs.
 */
export function assertCorrectionShape(original: TransactionRecord, c: CorrectionCommit): void {
  const { reversal, replacement } = c;
  if (reversal.state !== "posted" || reversal.correctionOf !== original.id) {
    throw invalid("reversal must be posted and link to the original");
  }
  if (
    reversal.occurredAtMs !== original.occurredAtMs ||
    reversal.intentType !== original.intentType
  ) {
    throw invalid("reversal must carry the original's date and intent");
  }
  if (c.reversalEntries.length > 0) assertBalanced(c.reversalEntries);

  const isOpening = original.intentType === "openingBalance";
  if (isOpening !== (c.cutoverMarker !== undefined)) {
    throw invalid("only an opening correction carries a marker");
  }
  if (c.cutoverMarker) {
    if (
      replacement === undefined ||
      replacement.transaction.occurredAtMs !== c.cutoverMarker.effectiveAt.epochMs
    ) {
      throw invalid("an opening correction needs a dated replacement");
    }
  }
  if (replacement) {
    const t = replacement.transaction;
    if ((t.intentType === "openingBalance") !== isOpening) {
      throw invalid("replacement kind does not match the original");
    }
    if (t.correctionOf !== original.id) throw invalid("replacement must link to the original");
    if (t.id === reversal.id || t.id === original.id) {
      throw invalid("replacement must have its own transaction id");
    }
    if (t.state !== "posted") throw invalid("replacement must be posted");
    if (replacement.entries.length > 0 || c.cutoverMarker === undefined) {
      assertBalanced(replacement.entries);
    }
  }
}
