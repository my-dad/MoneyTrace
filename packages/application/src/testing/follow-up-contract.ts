import { asOwnerId } from "@moneytrace/domain";
import { beforeEach, describe, expect, it } from "vitest";
import type { FollowUpRecord, FollowUpRepository } from "../ports/follow-up-repository";

const alice = asOwnerId("alice");
const bob = asOwnerId("bob");
const T = 1_700_000_000_000;

export const followUpRecord = (over: Partial<FollowUpRecord> = {}): FollowUpRecord => ({
  id: "f1",
  trigger: "withdrawalDestination",
  targetTransactionId: "t1",
  question: "Where did the cash go?",
  dueAtMs: T,
  snoozedUntilMs: null,
  state: "open",
  createdAtMs: T,
  resolvedAtMs: null,
  ...over,
});

export type FollowUpHarness = {
  repo: FollowUpRepository;
  seed: (ownerId: typeof alice, record: FollowUpRecord) => Promise<void>;
};

export function describeFollowUpContract(name: string, make: () => Promise<FollowUpHarness>): void {
  describe(`${name} follow-up contract`, () => {
    let repo: FollowUpRepository;
    let seed: FollowUpHarness["seed"];
    beforeEach(async () => {
      ({ repo, seed } = await make());
    });

    it("gets a follow-up, only for its owner", async () => {
      await seed(alice, followUpRecord());
      expect(await repo.get(alice, "f1")).toMatchObject({
        state: "open",
        question: expect.any(String) as string,
      });
      expect(await repo.get(bob, "f1")).toBeNull();
    });

    it("resolve closes it once", async () => {
      await seed(alice, followUpRecord());
      expect(await repo.resolve(alice, "f1", "wallet", T + 1)).toBe("resolved");
      expect(await repo.get(alice, "f1")).toMatchObject({
        state: "resolved",
        resolution: "wallet",
        resolvedAtMs: T + 1,
      });
      expect(await repo.resolve(alice, "f1", "other", T + 2)).toBe("alreadyClosed");
      expect(await repo.get(alice, "f1")).toMatchObject({ resolution: "wallet" });
    });

    it("snooze hides it, and is refused on a closed one", async () => {
      await seed(alice, followUpRecord());
      expect(await repo.snooze(alice, "f1", T + 100)).toBe("snoozed");
      expect(await repo.get(alice, "f1")).toMatchObject({
        state: "snoozed",
        snoozedUntilMs: T + 100,
      });
      await repo.resolve(alice, "f1", "x", T);
      expect(await repo.snooze(alice, "f1", T + 200)).toBe("alreadyClosed");
    });

    it("pushDue moves the due time and stays open", async () => {
      await seed(alice, followUpRecord());
      await repo.pushDue(alice, "f1", T + 500);
      expect(await repo.get(alice, "f1")).toMatchObject({ state: "open", dueAtMs: T + 500 });
    });

    it("lists only snoozed follow-ups whose time has come, across owners", async () => {
      await seed(alice, followUpRecord({ id: "due", state: "snoozed", snoozedUntilMs: T }));
      await seed(bob, followUpRecord({ id: "bobs", state: "snoozed", snoozedUntilMs: T }));
      await seed(alice, followUpRecord({ id: "later", state: "snoozed", snoozedUntilMs: T + 1 }));
      await seed(alice, followUpRecord({ id: "open" }));
      const rows = await repo.listDueToWake(T, 10);
      expect(rows.map((r) => [r.ownerId, r.id]).sort()).toEqual([
        ["alice", "due"],
        ["bob", "bobs"],
      ]);
    });

    it("wake reopens once, so overlapping runs count one", async () => {
      await seed(alice, followUpRecord({ state: "snoozed", snoozedUntilMs: T }));
      expect(await repo.wake(alice, "f1", T)).toBe("woken");
      expect(await repo.wake(alice, "f1", T)).toBe("notSnoozed");
      expect(await repo.get(alice, "f1")).toMatchObject({
        state: "open",
        snoozedUntilMs: null,
        dueAtMs: T,
      });
    });

    it("wake refuses a follow-up whose snooze was extended", async () => {
      await seed(alice, followUpRecord({ state: "snoozed", snoozedUntilMs: T + 100 }));
      expect(await repo.wake(alice, "f1", T)).toBe("notSnoozed");
    });
  });
}
