import {
  DomainError,
  Money,
  asAccountId,
  asTransactionId,
  defaultPostingPolicy,
  reverseEntries,
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
import { auditDetailsOf } from "./audit-details";

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
  }): Promise<LedgerCommitResult> {
    const { ownerId } = input;
    const { reader } = this.deps;
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
    const reversalEntries = reverseEntries(
      (await reader.getEntries(ownerId, original.id)).map(toDraft),
    );
    const replacementEntries =
      input.replacement === null ? null : defaultPostingPolicy.toEntries(input.replacement);
    if (replacementEntries?.length === 0) {
      throw new DomainError("invalidIntent", "replacement produced no entries");
    }
    if (replacementEntries) {
      await assertAccountsUsable(this.deps.accounts, ownerId, replacementEntries);
    }

    const committedAtMs = this.deps.clock.nowMs();
    const base = {
      state: "posted",
      occurredAtMs: original.occurredAtMs,
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
    };
    const audit = input.replacement ? auditDetailsOf(input.replacement) : undefined;
    const replacement: TransactionRecord | null = input.replacement
      ? {
          ...base,
          id: asTransactionId(`${original.id}:repl`),
          intentType: input.replacement.type,
          ...(audit ? { auditDetails: audit } : {}),
        }
      : null;

    const payloadHash = this.deps.hasher.sha256(
      canonicalPayload(reversalEntries, original.occurredAtMs, {
        original: original.id,
        rationale: input.rationale,
        replacement: replacementEntries ? entriesToJson(replacementEntries) : null,
        replacementType: input.replacement?.type ?? null,
      }),
    );
    return this.deps.writer.commitCorrection(ownerId, {
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      originalTransactionId: original.id,
      reversal,
      reversalEntries,
      ...(replacement && replacementEntries
        ? { replacement: { transaction: replacement, entries: replacementEntries } }
        : {}),
    });
  }
}
