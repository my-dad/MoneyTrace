import {
  DomainError,
  Money,
  asAccountId,
  asIdempotencyKey,
  asTransactionId,
  type AccountRef,
  type AdjustmentIntent,
  type OwnerId,
} from "@moneytrace/domain";
import type { AccountRepository } from "../ports/account-repository";
import type { Clock } from "../ports/clock";
import type { FollowUpRepository } from "../ports/follow-up-repository";
import type { LedgerReader } from "../ports/ledger-reader";
import type { ReconciliationRepository } from "../ports/reconciliation-repository";
import { SYSTEM_CASH_ACCOUNT_ID } from "./bootstrap-user";
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
 * come from the stored count, never from the client. The adjustment is never spending. A short
 * count is taken from the cash not yet explained first, then from Cash, in one posting.
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
    const found = await accounts.getMany(ownerId, [asAccountId(count.accountId), SYSTEM_CASH_ACCOUNT_ID]);
    const ref = (id: string): AccountRef | undefined => {
      const a = found.find((r) => r.id === id);
      return a === undefined ? undefined : { id: a.id, kind: a.kind, currency: a.currency };
    };
    const cash = ref(count.accountId);
    if (cash === undefined) throw new DomainError("accountInvalid", "the Cash account is missing");
    const decrease = count.differenceMinor < 0;
    const unexplained = ref(SYSTEM_CASH_ACCOUNT_ID);
    const held = decrease && unexplained !== undefined ? await reader.getBalance(ownerId, unexplained.id) : 0;
    const fromUnexplained = Math.min(result.adjustmentMinor, Math.max(held, 0));
    const fromCash = result.adjustmentMinor - fromUnexplained;
    const money = (minor: number) => Money.ofMinor(minor, count.currency);
    const legs: Pick<AdjustmentIntent, "account" | "amount" | "also"> =
      unexplained === undefined || fromUnexplained === 0
        ? { account: cash, amount: money(result.adjustmentMinor) }
        : fromCash === 0
          ? { account: unexplained, amount: money(fromUnexplained) }
          : { account: cash, amount: money(fromCash), also: { account: unexplained, amount: money(fromUnexplained) } };
    const outcome = await post.execute({
      ownerId,
      idempotencyKey: asIdempotencyKey(`adjust-${count.id}`),
      transactionId,
      intent: {
        type: "adjustment",
        ...legs,
        direction: decrease ? "decrease" : "increase",
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
    const { reconciliations, followUps, reader, clock } = this.deps;
    const nowMs = clock.nowMs();
    await reconciliations.markStatus(ownerId, id, "adjusted", transactionId, nowMs);
    await followUps.resolve(ownerId, `fu-${id}`, "adjusted", nowMs);
    // A count that used up the cash not yet explained also answers its ATM questions.
    const tx = await reader.getEntries(ownerId, asTransactionId(transactionId));
    const tookUnexplained = tx.some((e) => e.accountId === SYSTEM_CASH_ACCOUNT_ID && e.side === "credit");
    if (!tookUnexplained || (await reader.getBalance(ownerId, SYSTEM_CASH_ACCOUNT_ID)) > 0) return;
    for (const question of await followUps.listOpen(ownerId)) {
      if (question.trigger === "withdrawalDestination") {
        await followUps.resolve(ownerId, question.id, "counted", nowMs);
      }
    }
  }
}
