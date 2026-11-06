import {
  DomainError,
  LedgerDate,
  defaultPostingPolicy,
  type IdempotencyKey,
  type OwnerId,
  type PostingIntent,
  type SourceEventId,
  type TransactionId,
} from "@moneytrace/domain";
import type { AccountRepository } from "../ports/account-repository";
import type { Clock } from "../ports/clock";
import type { Hasher } from "../ports/hasher";
import type { TransactionRecord } from "../ports/ledger-reader";
import {
  canonicalPayload,
  type LedgerCommitResult,
  type LedgerWriter,
} from "../ports/ledger-writer";
import { assertAccountsUsable } from "./account-validation";
import { auditDetailsOf } from "./audit-details";

type Deps = { writer: LedgerWriter; accounts: AccountRepository; hasher: Hasher; clock: Clock };

export class PostTransaction {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    idempotencyKey: IdempotencyKey;
    transactionId: TransactionId;
    intent: PostingIntent;
    occurredAtMs: number;
    sourceEventIds: readonly SourceEventId[];
    actor: string;
  }): Promise<LedgerCommitResult> {
    const { ownerId, intent } = input;
    if (intent.type === "openingBalance") {
      throw new DomainError("invalidIntent", "opening balances go through RecordOpeningBalance");
    }
    LedgerDate.fromEpochMs(input.occurredAtMs);
    const entries = defaultPostingPolicy.toEntries(intent);
    const first = entries[0];
    if (first === undefined) throw new DomainError("invalidIntent", "intent produced no entries");
    await assertAccountsUsable(this.deps.accounts, ownerId, entries);

    const audit = auditDetailsOf(intent);
    const transaction: TransactionRecord = {
      id: input.transactionId,
      state: "posted",
      intentType: intent.type,
      occurredAtMs: input.occurredAtMs,
      currency: first.amount.currency,
      sourceEventIds: input.sourceEventIds,
      actor: input.actor,
      ...(audit ? { auditDetails: audit } : {}),
      committedAtMs: this.deps.clock.nowMs(),
    };
    const payloadHash = this.deps.hasher.sha256(
      canonicalPayload(entries, input.occurredAtMs, {
        transactionId: input.transactionId,
        intentType: intent.type,
        sourceEventIds: [...input.sourceEventIds],
      }),
    );
    return this.deps.writer.commit(ownerId, {
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      transaction,
      entries,
    });
  }
}
