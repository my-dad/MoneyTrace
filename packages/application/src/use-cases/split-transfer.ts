import {
  DomainError,
  Money,
  asAccountId,
  asIdempotencyKey,
  asSourceEventId,
  asTransactionId,
  type AccountRef,
  type CandidateTransaction,
  type OwnerId,
  type PostingIntent,
  type TransactionId,
} from "@moneytrace/domain";
import type { AccountRepository } from "../ports/account-repository";
import type { Clock } from "../ports/clock";
import type { Hasher } from "../ports/hasher";
import type { LedgerReader } from "../ports/ledger-reader";
import type { LedgerWriter } from "../ports/ledger-writer";
import type { SourceEventRepository } from "../ports/source-event-repository";
import { candidateToIntent } from "../pipeline/candidate-to-intent";
import { SYSTEM_CASH_ACCOUNT_ID } from "./bootstrap-user";
import { rebuildIntent } from "./correct-transaction";
import { ReverseAndReplace } from "./reverse-and-replace";

type Deps = {
  sourceEvents: SourceEventRepository;
  reader: LedgerReader;
  writer: LedgerWriter;
  accounts: AccountRepository;
  hasher: Hasher;
  clock: Clock;
};

export type SplitTransferResult = {
  spentTransactionId: string;
  cameInTransactionId: string;
  amountMinor: number;
  status: "recorded" | "alreadyRecorded";
};

const RATIONALE = "Not a transfer: counted separately";

/**
 * "Not a transfer" (CR-008 §9). The event is the half that was paired into the transfer
 * `txn-<A>:repl`. In one ledger write the transfer is reversed, A is recorded again as it was
 * (`txn-<A>:repl:repl`) and this event gets its own posting (`txn-<event>`). The key is fixed by
 * the event, so a retry, or a crash before the event is updated, never reverses twice.
 */
export class SplitTransfer {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: { ownerId: OwnerId; sourceEventId: string }): Promise<SplitTransferResult> {
    const { ownerId } = input;
    const { sourceEvents, reader, clock } = this.deps;
    const event = await sourceEvents.get(ownerId, asSourceEventId(input.sourceEventId));
    if (event === null) throw new DomainError("resourceNotFound", "no such message");
    const transferId = event.matchedTransactionId;
    const own = asTransactionId(`txn-${event.id}`);
    if (event.status !== "posted" || transferId === null || !transferId.endsWith(":repl")) {
      throw new DomainError("invalidTransition", "this message isn't a paired transfer");
    }
    const replacementId = asTransactionId(`${transferId}:repl`);
    if (event.matchKind === "none") {
      return { ...(await this.describe(ownerId, replacementId, own)), status: "alreadyRecorded" };
    }
    if (event.matchKind !== "transferCounterpart" || event.candidate === null || event.resolvedAccountId === null) {
      throw new DomainError("invalidTransition", "this message isn't a paired transfer");
    }

    // A as it was before pairing: the original A transaction, reversed when the pair was made.
    const originalA = asTransactionId(transferId.replace(/:repl$/, ""));
    const txA = await reader.getTransaction(ownerId, originalA);
    if (txA === null) throw new DomainError("invalidTransition", "the first message's record is missing");
    const entriesA = await reader.getEntries(ownerId, originalA);
    const amountA = entriesA.find((e) => e.side === "debit");
    if (amountA === undefined) throw new DomainError("invalidTransition", "the first message's record is empty");
    const intentA = rebuildIntent(txA, entriesA, Money.ofMinor(amountA.amountMinor, amountA.currency));

    const intentB = await this.ownIntent(ownerId, event.candidate, event.resolvedAccountId);
    const result = await new ReverseAndReplace(this.deps).execute({
      ownerId,
      idempotencyKey: asIdempotencyKey(`split-${event.id}`),
      originalTransactionId: asTransactionId(transferId),
      replacement: intentA,
      actor: ownerId,
      rationale: RATIONALE,
      alsoPost: {
        transactionId: own,
        intent: intentB,
        occurredAtMs: event.candidate.occurredAtMs ?? event.receivedAtMs,
        sourceEventIds: [event.id],
      },
    });
    if (result.status === "idempotencyConflict") {
      throw new DomainError("idempotencyConflict", "this transfer was already corrected differently");
    }
    await sourceEvents.markTransferSplit(ownerId, event.id, transferId, clock.nowMs());
    return {
      ...this.pair(intentA.type === "purchase", replacementId, own, amountA.amountMinor),
      status: result.status === "committed" ? "recorded" : "alreadyRecorded",
    };
  }

  private async ownIntent(
    ownerId: OwnerId,
    candidate: CandidateTransaction,
    accountId: string,
  ): Promise<PostingIntent> {
    const found = await this.deps.accounts.getMany(ownerId, [
      asAccountId(accountId),
      SYSTEM_CASH_ACCOUNT_ID,
    ]);
    const ref = (id: string): AccountRef | null => {
      const a = found.find((r) => r.id === id);
      return a === undefined ? null : { id: a.id, kind: a.kind, currency: a.currency };
    };
    const source = ref(accountId);
    const systemCash = ref(SYSTEM_CASH_ACCOUNT_ID);
    const intent =
      source === null || systemCash === null
        ? null
        : candidateToIntent(candidate, { source, destination: null, systemCash });
    if (intent === null) throw new DomainError("invalidTransition", "this message can't be recorded on its own");
    return intent;
  }

  private pair(aSpent: boolean, replacementId: TransactionId, own: TransactionId, amountMinor: number) {
    return {
      spentTransactionId: aSpent ? replacementId : own,
      cameInTransactionId: aSpent ? own : replacementId,
      amountMinor,
    };
  }

  /** An event already split: the answer is read back from the two postings it made. */
  private async describe(ownerId: OwnerId, replacementId: TransactionId, own: TransactionId) {
    const { reader } = this.deps;
    const [replacement, ownTx] = await Promise.all([
      reader.getTransaction(ownerId, replacementId),
      reader.getTransaction(ownerId, own),
    ]);
    const entries = await reader.getEntries(ownerId, replacementId);
    const amount = entries.find((e) => e.side === "debit");
    if (replacement === null || ownTx === null || amount === undefined) {
      throw new DomainError("invalidTransition", "this message isn't a paired transfer");
    }
    const spent = replacement.intentType === "purchase";
    return this.pair(spent, replacementId, own, amount.amountMinor);
  }
}
