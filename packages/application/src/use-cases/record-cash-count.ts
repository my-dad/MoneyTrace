import { formatBdt } from "@moneytrace/contracts";
import type { CurrencyCode, OwnerId } from "@moneytrace/domain";
import type { AccountRepository } from "../ports/account-repository";
import type { Clock } from "../ports/clock";
import type { FollowUpRecord, FollowUpRepository } from "../ports/follow-up-repository";
import type { LedgerReader } from "../ports/ledger-reader";
import type {
  ReconciliationRecord,
  ReconciliationRepository,
} from "../ports/reconciliation-repository";
import { CASH_ACCOUNT_ID } from "../pipeline/sources";
import { SYSTEM_CASH_ACCOUNT_ID } from "./bootstrap-user";

type Deps = {
  accounts: AccountRepository;
  reader: LedgerReader;
  reconciliations: ReconciliationRepository;
  followUps: FollowUpRepository;
  clock: Clock;
};

export type CashCountResult = {
  reconciliationId: string;
  status: "recorded" | "alreadyRecorded";
  countedMinor: number;
  expectedMinor: number;
  cashMinor: number;
  unexplainedMinor: number;
  differenceMinor: number;
  followUpId?: string;
};

/** Never says the cash was spent, lost or missing (PRD section 11). */
const gapQuestion = (differenceMinor: number): string =>
  `Your cash count was ${formatBdt(Math.abs(differenceMinor))} ${differenceMinor < 0 ? "less" : "more"} than expected. What explains the difference?`;

/**
 * A cash count (PRD gate 32): compares what the user counted with every active Cash account,
 * the wallet for cash not yet explained included and family-held cash left out. It never changes
 * a balance; a gap stays open as a question until the user answers it.
 */
export class RecordCashCount {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    idempotencyKey: string;
    countedMinor: number;
    currency: CurrencyCode;
  }): Promise<CashCountResult> {
    const { ownerId, countedMinor } = input;
    const { accounts, reader, reconciliations, clock } = this.deps;
    const id = `recon-${input.idempotencyKey}`;
    const stored = await reconciliations.get(ownerId, id);
    if (stored !== null) return this.replay(ownerId, stored);

    const cash = (await accounts.list(ownerId)).filter(
      (a) => a.kind === "cash" && a.status === "active",
    );
    const held = await Promise.all(cash.map(async (a) => ({ id: a.id, minor: await reader.getBalance(ownerId, a.id) })));
    const expectedMinor = held.reduce((sum, a) => sum + a.minor, 0);
    const differenceMinor = countedMinor - expectedMinor;
    const nowMs = clock.nowMs();
    const record: ReconciliationRecord = {
      id,
      accountId: CASH_ACCOUNT_ID,
      kind: "cashCount",
      currency: input.currency,
      asOfMs: nowMs,
      statedBalanceMinor: countedMinor,
      expectedBalanceMinor: expectedMinor,
      differenceMinor,
      reviewStatus: differenceMinor === 0 ? "reviewed" : "open",
      adjustmentTransactionIds: [],
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };
    const question: FollowUpRecord | null =
      differenceMinor === 0
        ? null
        : {
            id: `fu-${id}`,
            trigger: "reconciliationDifference",
            targetAccountId: CASH_ACCOUNT_ID,
            targetReconciliationId: id,
            question: gapQuestion(differenceMinor),
            dueAtMs: nowMs,
            snoozedUntilMs: null,
            state: "open",
            createdAtMs: nowMs,
            resolvedAtMs: null,
          };
    const unexplainedMinor = held.find((a) => a.id === SYSTEM_CASH_ACCOUNT_ID)?.minor ?? 0;
    const created = await reconciliations.recordCount(ownerId, record, question);
    if (created === "exists") {
      const winner = await reconciliations.get(ownerId, id);
      if (winner === null) throw new Error("a stored count vanished");
      return this.replay(ownerId, winner);
    }
    await this.supersedeOlder(ownerId, record);
    return {
      reconciliationId: id,
      status: "recorded",
      countedMinor,
      expectedMinor,
      cashMinor: expectedMinor - unexplainedMinor,
      unexplainedMinor,
      differenceMinor,
      ...(question === null ? {} : { followUpId: question.id }),
    };
  }

  /** A replay also finishes closing older counts, in case the first attempt stopped before that. */
  private async replay(ownerId: OwnerId, stored: ReconciliationRecord): Promise<CashCountResult> {
    await this.supersedeOlder(ownerId, stored);
    return { ...(await this.describe(ownerId, stored)), status: "alreadyRecorded" };
  }

  /**
   * The newest count is the one that matters: strictly older open gaps are closed, never adjusted
   * later. Idempotent, and counts made at the same moment leave each other open.
   */
  private async supersedeOlder(ownerId: OwnerId, current: ReconciliationRecord): Promise<void> {
    const { reconciliations, followUps, clock } = this.deps;
    const nowMs = clock.nowMs();
    for (const older of await reconciliations.listOpenCashCounts(ownerId)) {
      if (older.id === current.id || older.asOfMs >= current.asOfMs) continue;
      await reconciliations.markStatus(ownerId, older.id, "dismissed", null, nowMs);
      await followUps.resolve(ownerId, `fu-${older.id}`, "superseded", nowMs);
    }
  }

  /** A replay reports the stored count. The split is today's, since the count keeps only the total. */
  private async describe(ownerId: OwnerId, r: ReconciliationRecord): Promise<CashCountResult> {
    const unexplained = await this.deps.reader.getBalance(ownerId, SYSTEM_CASH_ACCOUNT_ID);
    const unexplainedMinor = Math.min(unexplained, r.expectedBalanceMinor);
    return {
      reconciliationId: r.id,
      status: "alreadyRecorded",
      countedMinor: r.statedBalanceMinor,
      expectedMinor: r.expectedBalanceMinor,
      cashMinor: r.expectedBalanceMinor - unexplainedMinor,
      unexplainedMinor,
      differenceMinor: r.differenceMinor,
      ...(r.differenceMinor === 0 ? {} : { followUpId: `fu-${r.id}` }),
    };
  }
}
