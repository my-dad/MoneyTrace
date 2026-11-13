import { asOwnerId } from "@moneytrace/domain";
import { beforeEach, describe, expect, it } from "vitest";
import type { FollowUpRecord, FollowUpRepository } from "../ports/follow-up-repository";
import type {
  ReconciliationRecord,
  ReconciliationRepository,
} from "../ports/reconciliation-repository";

const alice = asOwnerId("alice");
const bob = asOwnerId("bob");
const T = 1_700_000_000_000;

export const cashCountRecord = (over: Partial<ReconciliationRecord> = {}): ReconciliationRecord => ({
  id: "recon-k1",
  accountId: "cash-main",
  kind: "cashCount",
  currency: "BDT",
  asOfMs: T,
  statedBalanceMinor: 230_000,
  expectedBalanceMinor: 300_000,
  differenceMinor: -70_000,
  reviewStatus: "open",
  adjustmentTransactionIds: [],
  createdAtMs: T,
  updatedAtMs: T,
  ...over,
});

const gapQuestion = (reconciliationId: string): FollowUpRecord => ({
  id: `fu-${reconciliationId}`,
  trigger: "reconciliationDifference",
  targetAccountId: "cash-main",
  targetReconciliationId: reconciliationId,
  question: "Your cash count was ৳700 less than expected. What explains the difference?",
  dueAtMs: T,
  snoozedUntilMs: null,
  state: "open",
  createdAtMs: T,
  resolvedAtMs: null,
});

export type ReconciliationHarness = {
  repo: ReconciliationRepository;
  followUps: FollowUpRepository;
};

export function describeReconciliationContract(
  name: string,
  make: () => Promise<ReconciliationHarness>,
): void {
  describe(`${name} reconciliation contract`, () => {
    let repo: ReconciliationRepository;
    let followUps: FollowUpRepository;
    beforeEach(async () => {
      ({ repo, followUps } = await make());
    });

    it("records a count and its question together", async () => {
      expect(await repo.recordCount(alice, cashCountRecord(), gapQuestion("recon-k1"))).toBe(
        "created",
      );
      expect(await repo.get(alice, "recon-k1")).toEqual(cashCountRecord());
      expect(await followUps.get(alice, "fu-recon-k1")).toMatchObject({
        state: "open",
        targetReconciliationId: "recon-k1",
      });
    });

    it("a matching count needs no question", async () => {
      const matching = cashCountRecord({ differenceMinor: 0, reviewStatus: "reviewed" });
      expect(await repo.recordCount(alice, matching, null)).toBe("created");
      expect(await repo.get(alice, "recon-k1")).toEqual(matching);
    });

    it("an existing id is left alone and writes no second question", async () => {
      await repo.recordCount(alice, cashCountRecord(), null);
      expect(
        await repo.recordCount(alice, cashCountRecord({ statedBalanceMinor: 1 }), gapQuestion("recon-k1")),
      ).toBe("exists");
      expect((await repo.get(alice, "recon-k1"))?.statedBalanceMinor).toBe(230_000);
      expect(await followUps.get(alice, "fu-recon-k1")).toBeNull();
    });

    it("lists only the owner's open cash counts", async () => {
      await repo.recordCount(alice, cashCountRecord(), null);
      await repo.recordCount(alice, cashCountRecord({ id: "recon-k2", reviewStatus: "reviewed", differenceMinor: 0 }), null);
      await repo.recordCount(bob, cashCountRecord({ id: "recon-b" }), null);
      expect((await repo.listOpenCashCounts(alice)).map((r) => r.id)).toEqual(["recon-k1"]);
    });

    it("marks an open count once, keeping the adjustment's id", async () => {
      await repo.recordCount(alice, cashCountRecord(), null);
      expect(await repo.markStatus(alice, "recon-k1", "adjusted", "txn-adjust-recon-k1", T + 5)).toBe(
        "updated",
      );
      expect(await repo.get(alice, "recon-k1")).toMatchObject({
        reviewStatus: "adjusted",
        adjustmentTransactionIds: ["txn-adjust-recon-k1"],
        updatedAtMs: T + 5,
      });
      expect(await repo.markStatus(alice, "recon-k1", "dismissed", null, T + 6)).toBe("notOpen");
      expect(await repo.markStatus(alice, "recon-missing", "dismissed", null, T + 6)).toBe("notOpen");
    });

    it("another owner cannot read or change the count", async () => {
      await repo.recordCount(alice, cashCountRecord(), null);
      expect(await repo.get(bob, "recon-k1")).toBeNull();
      expect(await repo.markStatus(bob, "recon-k1", "dismissed", null, T)).toBe("notOpen");
      expect((await repo.get(alice, "recon-k1"))?.reviewStatus).toBe("open");
    });
  });
}
