import type {
  CutoverMarker,
  EntryDraft,
  IdempotencyKey,
  OwnerId,
  TransactionId,
} from "@moneytrace/domain";
import type { TransactionRecord } from "./ledger-reader";

export type LedgerCommit = {
  idempotencyKey: IdempotencyKey;
  payloadHash: string;
  transaction: TransactionRecord;
  entries: readonly EntryDraft[];
  cutoverMarker?: CutoverMarker;
};

export type CorrectionCommit = {
  idempotencyKey: IdempotencyKey;
  payloadHash: string;
  originalTransactionId: TransactionId;
  reversal: TransactionRecord;
  reversalEntries: readonly EntryDraft[];
  replacement?: { transaction: TransactionRecord; entries: readonly EntryDraft[] };
  /** Present exactly when the original is an opening balance: replaces the account's marker. */
  cutoverMarker?: CutoverMarker;
};

export type LedgerCommitResult =
  | { status: "committed" | "duplicate"; transactionId: TransactionId }
  | { status: "idempotencyConflict" };

/**
 * Every method is atomic: all checks and writes succeed together or nothing is written.
 *
 * commit: replays of the same key and payload return `duplicate`; the same key with another
 * payload returns `idempotencyConflict`. Entries must balance (empty entries are legal only
 * with a cutover marker). The transition into `posted` is checked against the stored state.
 * At most one cutover marker exists per account: a second one is `idempotencyConflict`.
 *
 * A marker's effective date must equal its transaction's occurredAtMs.
 *
 * commitCorrection: the original must be `posted` and not itself a reversal (else DomainError
 * `invalidTransition`). The reversal must be `posted`, link back through `correctionOf`, and
 * mirror the stored entries exactly (else `invalidIntent`). The original becomes `reversed`, and
 * the reversal and optional replacement are written in the same step. Opening balances are
 * corrected only with a replacement and a `cutoverMarker` that atomically replaces the
 * account's marker; no other transaction may carry one. Entry sets may be empty only for an
 * opening balance that has no entries.
 */
export type LedgerWriter = {
  commit(ownerId: OwnerId, c: LedgerCommit): Promise<LedgerCommitResult>;
  commitCorrection(ownerId: OwnerId, c: CorrectionCommit): Promise<LedgerCommitResult>;
  savePending(ownerId: OwnerId, t: TransactionRecord): Promise<void>;
};

export type Json =
  string | number | boolean | null | readonly Json[] | { readonly [k: string]: Json };

function stable(v: Json): string {
  if (Array.isArray(v)) return `[${(v as readonly Json[]).map(stable).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const o = v as { readonly [k: string]: Json };
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k] as Json)}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export function entriesToJson(entries: readonly EntryDraft[]): Json {
  return entries.map((e) => ({
    account: e.account.id,
    kind: e.account.kind,
    side: e.side,
    minor: e.amount.minor,
    currency: e.amount.currency,
  }));
}

/** Deterministic JSON (sorted keys) of what a posting means; hash it for `payloadHash`. */
export function canonicalPayload(
  entries: readonly EntryDraft[],
  occurredAtMs: number,
  extra: { readonly [k: string]: Json } = {},
): string {
  return stable({ entries: entriesToJson(entries), occurredAtMs, extra });
}
