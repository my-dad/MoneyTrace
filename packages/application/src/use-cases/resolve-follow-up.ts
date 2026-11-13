import { nextLocalTimeMs } from "@moneytrace/contracts";
import {
  DomainError,
  Money,
  asAccountId,
  asIdempotencyKey,
  asSourceEventId,
  asTransactionId,
  type AccountRef,
  type OwnerId,
  type TransactionId,
  type PostingIntent,
} from "@moneytrace/domain";
import type { AccountRecord, AccountRepository } from "../ports/account-repository";
import type { Clock } from "../ports/clock";
import type { FollowUpRecord, FollowUpRepository } from "../ports/follow-up-repository";
import type { LedgerReader } from "../ports/ledger-reader";
import { SYSTEM_CASH_ACCOUNT_ID } from "./bootstrap-user";
import type { PostTransaction } from "./post-transaction";

const DEFAULT_TIMEZONE = "Asia/Dhaka";
const DEFAULT_DIGEST_LOCAL_TIME = "20:00";

type Deps = {
  followUps: FollowUpRepository;
  reader: LedgerReader;
  accounts: AccountRepository;
  post: PostTransaction;
  clock: Clock;
};

export type FollowUpResolution =
  { kind: "destination"; accountId: string } | { kind: "notSureYet" };

const refOf = (a: AccountRecord): AccountRef => ({ id: a.id, kind: a.kind, currency: a.currency });

export class ResolveFollowUp {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    followUpId: string;
    resolution: FollowUpResolution;
  }): Promise<{ state: "resolved" | "open" }> {
    const { ownerId, followUpId, resolution } = input;
    const { followUps, clock } = this.deps;
    const followUp = await followUps.get(ownerId, followUpId);
    if (followUp === null) throw new DomainError("resourceNotFound", "no such follow-up");
    if (followUp.state === "resolved" || followUp.state === "dismissed") {
      return { state: "resolved" };
    }
    if (resolution.kind === "notSureYet") {
      await followUps.pushDue(
        ownerId,
        followUpId,
        nextLocalTimeMs(clock.nowMs(), DEFAULT_TIMEZONE, DEFAULT_DIGEST_LOCAL_TIME),
      );
      return { state: "open" };
    }
    await this.moveCash(ownerId, followUp, resolution.accountId);
    await followUps.resolve(ownerId, followUpId, resolution.accountId, clock.nowMs());
    return { state: "resolved" };
  }

  /** The key and date are fixed by the follow-up, so a repeat replays as a duplicate. */
  private async moveCash(
    ownerId: OwnerId,
    followUp: FollowUpRecord,
    destinationId: string,
  ): Promise<void> {
    const { accounts, reader, post } = this.deps;
    const refs = await accounts.getMany(ownerId, [
      asAccountId(destinationId),
      SYSTEM_CASH_ACCOUNT_ID,
    ]);
    const destination = refs.find((a) => a.id === destinationId);
    const from = refs.find((a) => a.id === SYSTEM_CASH_ACCOUNT_ID);
    if (destination === undefined || from === undefined || destination.status !== "active") {
      throw new DomainError("accountInvalid", "account is missing or closed");
    }
    if (destination.id === from.id) {
      throw new DomainError("invalidIntent", "choose where the cash is now");
    }
    if (followUp.targetTransactionId === undefined) {
      throw new DomainError("invalidIntent", "this follow-up has no transaction");
    }
    const entries = await reader.getEntries(ownerId, await currentVersion(reader, ownerId, followUp.targetTransactionId));
    const entry = entries.find((e) => e.accountId === SYSTEM_CASH_ACCOUNT_ID && e.side === "debit");
    if (entry === undefined) throw new DomainError("invalidIntent", "nothing to place");
    // A cash count may already have taken some of it: never move more than is still there.
    const held = await reader.getBalance(ownerId, SYSTEM_CASH_ACCOUNT_ID);
    const minor = Math.min(entry.amountMinor, held);
    if (minor <= 0) return;
    const amount = Money.ofMinor(minor, entry.currency);
    let intent: PostingIntent;
    if (destination.kind === "cash") {
      intent = { type: "transfer", from: refOf(from), to: refOf(destination), amount };
    } else if (destination.kind === "familyCash") {
      intent = {
        type: "cashCustodyTransfer",
        from: refOf(from),
        to: refOf(destination),
        amount,
        holderName: destination.name,
      };
    } else {
      throw new DomainError("invalidIntent", "cash can only go to a wallet or a family holder");
    }
    const result = await post.execute({
      ownerId,
      idempotencyKey: asIdempotencyKey(`followup-${followUp.id}`),
      transactionId: asTransactionId(`txn-followup-${followUp.id}`),
      intent,
      occurredAtMs: followUp.createdAtMs,
      sourceEventIds: [asSourceEventId(followUp.id.split(":")[0] ?? followUp.id)],
      actor: ownerId,
    });
    if (result.status === "idempotencyConflict") {
      throw new DomainError("idempotencyConflict", "this was already answered differently");
    }
  }
}

/**
 * The withdrawal as it stands now: a corrected one is replaced by `<id>:repl`, so the answer moves
 * the corrected amount. A withdrawal reversed with no replacement has no cash left to place.
 */
async function currentVersion(reader: LedgerReader, ownerId: OwnerId, transactionId: string): Promise<TransactionId> {
  let id = asTransactionId(transactionId);
  for (let depth = 0; depth < 32; depth++) {
    const transaction = await reader.getTransaction(ownerId, id);
    if (transaction === null) throw new DomainError("invalidIntent", "this follow-up has no transaction");
    if (transaction.state !== "reversed") return id;
    const replacement = await reader.getTransaction(ownerId, asTransactionId(`${id}:repl`));
    if (replacement === null) throw new DomainError("invalidIntent", "this withdrawal was reversed; nothing to place");
    id = replacement.id;
  }
  throw new DomainError("invalidIntent", "too many corrections to follow");
}
