import {
  DomainError,
  LedgerDate,
  Money,
  asAccountId,
  asTransactionId,
  defaultPostingPolicy,
  reverseEntries,
  type AccountId,
  type CutoverMarker,
  type EntryDraft,
  type IdempotencyKey,
  type OwnerId,
  type PostingIntent,
  type TransactionId,
} from "@moneytrace/domain";
import type { AccountRepository } from "../ports/account-repository";
import type { Clock } from "../ports/clock";
import type { Hasher } from "../ports/hasher";
import type { EntryRecord, LedgerReader, TransactionRecord } from "../ports/ledger-reader";
import {
  canonicalPayload,
  entriesToJson,
  type LedgerCommitResult,
  type LedgerWriter,
} from "../ports/ledger-writer";
import { assertAccountsUsable } from "./account-validation";
import { resolveIntent } from "./resolve-intent";
import { auditDetailsOf, auditJson } from "./audit-details";

type Deps = {
  writer: LedgerWriter;
  reader: LedgerReader;
  accounts: AccountRepository;
  hasher: Hasher;
  clock: Clock;
};

const toDraft = (e: EntryRecord): EntryDraft => ({
  account: { id: asAccountId(e.accountId), kind: e.accountKind, currency: e.currency },
  side: e.side,
  amount: Money.ofMinor(e.amountMinor, e.currency),
});

/** Corrects a posted transaction by reversal plus an optional replacement, atomically. */
export class ReverseAndReplace {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    idempotencyKey: IdempotencyKey;
    originalTransactionId: TransactionId;
    replacement: PostingIntent | null;
    actor: string;
    rationale: string;
    /** Date of a non-opening replacement; defaults to the original's. */
    occurredAtMs?: number;
  }): Promise<LedgerCommitResult> {
    const { ownerId } = input;
    const { reader } = this.deps;
    const { replacement } = input;
    if (input.actor.trim() === "")
      throw new DomainError("invalidIntent", "actor must not be blank");
    if (input.rationale.trim() === "") {
      throw new DomainError("invalidIntent", "a correction needs a rationale");
    }
    const original = await reader.getTransaction(ownerId, input.originalTransactionId);
    if (original === null)
      throw new DomainError("invalidTransition", "original transaction not found");

    // A reversal is the transaction its parent's `reversedBy` points back to; it is never itself reversed.
    if (original.correctionOf !== undefined) {
      const parent = await reader.getTransaction(ownerId, original.correctionOf);
      if (parent?.reversedBy === original.id) {
        throw new DomainError("invalidTransition", "a reversal cannot itself be reversed");
      }
    }

    // The state check is the writer's: a replay of a finished correction must still read as a duplicate.
    const originalEntries = await reader.getEntries(ownerId, original.id);
    const reversalEntries = reverseEntries(originalEntries.map(toDraft));

    // Every account keeps exactly one effective opening: only an opening for the same account
    // may replace an opening, and an opening may replace nothing else.
    const isOpening = original.intentType === "openingBalance";
    let marker: CutoverMarker | undefined;
    let replacementEntries: EntryDraft[] | null = null;
    let replacementMs = input.occurredAtMs ?? original.occurredAtMs;
    let resolved: PostingIntent | null = null;
    if (isOpening) {
      if (replacement?.type !== "openingBalance") {
        throw new DomainError(
          "invalidIntent",
          "an opening balance is corrected by another opening",
        );
      }
      if (!isSameOpeningAccount(original, originalEntries, replacement.account.id)) {
        throw new DomainError("invalidIntent", "the replacement opening is for another account");
      }
      if (input.occurredAtMs !== undefined) {
        throw new DomainError("invalidIntent", "an opening's date is its effectiveAt");
      }
      replacementMs = replacement.effectiveAt.epochMs;
      replacementEntries = defaultPostingPolicy.toEntries(replacement);
      // A zero opening has no entries, so the account check needs the account itself.
      await assertAccountsUsable(
        this.deps.accounts,
        ownerId,
        replacementEntries.length > 0
          ? replacementEntries
          : [{ account: replacement.account, side: "debit", amount: replacement.amount }],
      );
      marker = { accountId: replacement.account.id, effectiveAt: replacement.effectiveAt };
      resolved = replacement;
    } else if (replacement !== null) {
      if (replacement.type === "openingBalance") {
        throw new DomainError(
          "invalidIntent",
          "only an opening balance can be replaced by an opening",
        );
      }
      LedgerDate.fromEpochMs(replacementMs);
      ({ intent: resolved, entries: replacementEntries } = await resolveIntent(
        reader,
        ownerId,
        replacement,
        replacementMs,
      ));
      if (replacementEntries.length === 0) {
        throw new DomainError("invalidIntent", "replacement produced no entries");
      }
      await assertAccountsUsable(this.deps.accounts, ownerId, replacementEntries);
    }

    const committedAtMs = this.deps.clock.nowMs();
    const base = {
      state: "posted",
      currency: original.currency,
      sourceEventIds: original.sourceEventIds,
      actor: input.actor,
      rationale: input.rationale,
      correctionOf: original.id,
      committedAtMs,
    } as const;
    const reversal: TransactionRecord = {
      ...base,
      id: asTransactionId(`${original.id}:rev`),
      intentType: original.intentType,
      occurredAtMs: original.occurredAtMs,
    };
    const audit = resolved ? auditDetailsOf(resolved) : undefined;
    const replacementTx: TransactionRecord | null = resolved
      ? {
          ...base,
          id: asTransactionId(`${original.id}:repl`),
          intentType: resolved.type,
          occurredAtMs: replacementMs,
          ...(audit ? { auditDetails: audit } : {}),
        }
      : null;

    const payloadHash = this.deps.hasher.sha256(
      canonicalPayload(reversalEntries, original.occurredAtMs, {
        original: original.id,
        actor: input.actor,
        rationale: input.rationale,
        replacement:
          resolved && replacementEntries
            ? {
                entries: entriesToJson(replacementEntries),
                type: resolved.type,
                occurredAtMs: replacementMs,
                audit: auditJson(audit),
                occurredAt:
                  resolved.type === "historicalImport" ? resolved.occurredAt.epochMs : null,
              }
            : null,
      }),
    );
    return this.deps.writer.commitCorrection(ownerId, {
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      originalTransactionId: original.id,
      reversal,
      reversalEntries,
      ...(replacementTx && replacementEntries
        ? { replacement: { transaction: replacementTx, entries: replacementEntries } }
        : {}),
      ...(marker ? { cutoverMarker: marker } : {}),
    });
  }
}

/**
 * Transactions carry no account, so the account of an opening is read from its entries, or, for a
 * zero opening with none, from its id (`opening-<account>` plus any `:repl` suffixes).
 */
function isSameOpeningAccount(
  original: TransactionRecord,
  entries: readonly EntryRecord[],
  accountId: AccountId,
): boolean {
  if (entries.length > 0) return entries.some((e) => e.accountId === accountId);
  const base = `opening-${accountId}`;
  return original.id === base || original.id.startsWith(`${base}:repl`);
}
