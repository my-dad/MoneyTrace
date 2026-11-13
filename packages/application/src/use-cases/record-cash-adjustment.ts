import {
  DomainError,
  Money,
  asAccountId,
  asIdempotencyKey,
  asTransactionId,
  type OwnerId,
} from "@moneytrace/domain";
import type { AccountRepository } from "../ports/account-repository";
import type { Clock } from "../ports/clock";
import type { FollowUpRepository } from "../ports/follow-up-repository";
import type { LedgerReader } from "../ports/ledger-reader";
import type { ReconciliationRepository } from "../ports/reconciliation-repository";
import type { PostTransaction } from "./post-transaction";

type Deps = {
  reconciliations: ReconciliationRepository;
  followUps: FollowUpRepository;
  accounts: AccountRepository;
  reader: LedgerReader;
  post: PostTransaction;
  clock: Clock;
};

/**
 * Adjusts Cash to an open cash count, with the user's reason and sign-off. Direction and amount
 * come from the stored count, never from the client. The adjustment is never spending.
 */
export class RecordCashAdjustment {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    reconciliationId: string;
    cause: string;
  }): Promise<{
    transactionId: string;
    status: "recorded" | "alreadyRecorded";
    countedMinor: number;
    adjustmentMinor: number;
  }> {
    const { ownerId, reconciliationId } = input;
    const { reconciliations, accounts, reader, post } = this.deps;
    const cause = input.cause.trim();
    if (cause === "") throw new DomainError("invalidIntent", "an adjustment needs a reason");
    const count = await reconciliations.get(ownerId, reconciliationId);
    if (count?.kind !== "cashCount") throw new DomainError("resourceNotFound", "no such count");
    const transactionId = asTransactionId(`txn-adjust-${count.id}`);
    const result = {
      transactionId: transactionId as string,
      countedMinor: count.statedBalanceMinor,
      adjustmentMinor: Math.abs(count.differenceMinor),
    };
    // A finished adjustment, or one whose posting landed before the count was marked, replays.
    const posted = (await reader.getTransaction(ownerId, transactionId)) !== null;
    if (count.reviewStatus === "adjusted" || (posted && count.reviewStatus === "open")) {
      await this.close(ownerId, count.id, transactionId);
      return { ...result, status: "alreadyRecorded" };
    }
    if (count.reviewStatus !== "open" || count.differenceMinor === 0) {
      throw new DomainError("invalidTransition", "this count is not open for adjustment");
    }
    const [cash] = await accounts.getMany(ownerId, [asAccountId(count.accountId)]);
    if (cash === undefined) throw new DomainError("accountInvalid", "the Cash account is missing");
    const outcome = await post.execute({
      ownerId,
      idempotencyKey: asIdempotencyKey(`adjust-${count.id}`),
      transactionId,
      intent: {
        type: "adjustment",
        account: { id: cash.id, kind: cash.kind, currency: cash.currency },
        direction: count.differenceMinor < 0 ? "decrease" : "increase",
        amount: Money.ofMinor(result.adjustmentMinor, count.currency),
        cause,
        authorizedBy: ownerId,
      },
      occurredAtMs: count.asOfMs,
      sourceEventIds: [],
      actor: ownerId,
    });
    if (outcome.status === "idempotencyConflict") {
      throw new DomainError("idempotencyConflict", "this count was already adjusted differently");
    }
    await this.close(ownerId, count.id, transactionId);
    return { ...result, status: outcome.status === "committed" ? "recorded" : "alreadyRecorded" };
  }

  private async close(ownerId: OwnerId, id: string, transactionId: string): Promise<void> {
    const nowMs = this.deps.clock.nowMs();
    await this.deps.reconciliations.markStatus(ownerId, id, "adjusted", transactionId, nowMs);
    await this.deps.followUps.resolve(ownerId, `fu-${id}`, "adjusted", nowMs);
  }
}
