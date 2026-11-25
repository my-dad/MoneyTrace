import { DomainError, Money, asIdempotencyKey, asSourceEventId, asTransactionId, type OwnerId, type TransactionId } from "@moneytrace/domain";
import type { IncomeSource } from "@moneytrace/contracts";
import type { AccountRepository } from "../ports/account-repository";
import type { Clock } from "../ports/clock";
import type { Hasher } from "../ports/hasher";
import type { LedgerReader } from "../ports/ledger-reader";
import type { LedgerWriter } from "../ports/ledger-writer";
import type { SourceEventRepository } from "../ports/source-event-repository";
import { isManualEntry } from "../source-event-guards";
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

/** A correction chain never gets this long in practice; the bound keeps a bad chain from looping. */
const MAX_CHAIN = 50;

/**
 * Fixes cash income the user added by hand (amount, what it was from): the live record is
 * reversed and replaced, audited. Evidence from a bank is never edited this way.
 */
export class EditManualIncome {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    idempotencyKey: string;
    sourceEventId: string;
    amountMinor: number;
    from: IncomeSource;
  }): Promise<{ status: "recorded" | "alreadyRecorded" }> {
    const { ownerId } = input;
    const { sourceEvents } = this.deps;
    const event = await sourceEvents.get(ownerId, asSourceEventId(input.sourceEventId));
    if (event === null) throw new DomainError("resourceNotFound", "no such entry");
    if (!isManualEntry(event) || event.candidate?.kind !== "income") {
      throw new DomainError("invalidIntent", "only cash income you added can be edited");
    }
    if (event.status !== "posted") throw new DomainError("invalidTransition", "this income isn't recorded yet");

    const chain = await this.chain(ownerId, asTransactionId(`txn-${event.id}`));
    const live = chain[chain.length - 1];
    if (live === undefined) throw new DomainError("invalidTransition", "this income's record is missing");
    const key = asIdempotencyKey(`edit-income-${input.idempotencyKey}`);
    const first = await this.correct(ownerId, live, key, input);
    if (first !== "idempotencyConflict") return { status: first === "committed" ? "recorded" : "alreadyRecorded" };
    // The key was used before: if it made one of the earlier edits, this is that edit replayed.
    for (const earlier of chain.slice(0, -1).reverse()) {
      if ((await this.correct(ownerId, earlier, key, input)) === "duplicate") return { status: "alreadyRecorded" };
    }
    throw new DomainError("idempotencyConflict", "that key was used for a different edit");
  }

  private async correct(
    ownerId: OwnerId,
    original: TransactionId,
    key: ReturnType<typeof asIdempotencyKey>,
    input: { amountMinor: number; from: IncomeSource },
  ): Promise<"committed" | "duplicate" | "idempotencyConflict"> {
    const { reader } = this.deps;
    const tx = await reader.getTransaction(ownerId, original);
    if (tx === null) throw new DomainError("invalidTransition", "this income's record is missing");
    const entries = await reader.getEntries(ownerId, original);
    const result = await new ReverseAndReplace(this.deps).execute({
      ownerId,
      idempotencyKey: key,
      originalTransactionId: original,
      replacement: rebuildIntent(tx, entries, Money.ofMinor(input.amountMinor, tx.currency), input.from),
      actor: ownerId,
      rationale: "Edited by you",
    });
    return result.status;
  }

  /** The income's records in order, from the first to the one that counts now. */
  private async chain(ownerId: OwnerId, first: TransactionId): Promise<TransactionId[]> {
    const ids: TransactionId[] = [];
    let id = first;
    for (let i = 0; i < MAX_CHAIN; i++) {
      const tx = await this.deps.reader.getTransaction(ownerId, id);
      if (tx === null) throw new DomainError("invalidTransition", "this income's record is missing");
      ids.push(id);
      if (tx.state !== "reversed") return ids;
      id = asTransactionId(`${id}:repl`);
    }
    throw new DomainError("invalidTransition", "this income has too many edits");
  }
}
