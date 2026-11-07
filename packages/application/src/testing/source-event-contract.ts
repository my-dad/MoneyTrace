import { beforeEach, describe, expect, it } from "vitest";
import type { OwnerCollectionName } from "@moneytrace/contracts";
import { asOwnerId, asSourceEventId, type OwnerId, type SourceEventId } from "@moneytrace/domain";
import { PIPELINE_TIMEOUTS } from "../pipeline/timeouts";
import type {
  SourceEventInput,
  SourceEventRepository,
  StageClaim,
  StageCommit,
  StageOutput,
} from "../ports/source-event-repository";
import { stageOutputId } from "../source-event-guards";

export type SourceEventHarness = {
  repo: SourceEventRepository;
  /** What stage outputs wrote under one owner's collection. */
  outputsOf: (
    ownerId: OwnerId,
    collection: OwnerCollectionName,
  ) => Promise<Record<string, unknown>[]>;
};

const alice = asOwnerId("alice");
const bob = asOwnerId("bob");
const T0 = 1_700_000_000_000;
const LEASE = PIPELINE_TIMEOUTS.leaseMs;

const inputOf = (id: string, key = `key-${id}`, hash = `hash-${id}`): SourceEventInput => ({
  sourceEventId: asSourceEventId(id),
  sourceType: "sms",
  sourceHash: hash,
  idempotencyKey: key,
  receivedAtMs: T0,
});

/** A follow-up output with the deterministic ID a stage would use. */
export const followUpOutput = (eventId: string, stage: "match" | "normalize" = "normalize") => {
  const id = stageOutputId(eventId, stage, "followUp");
  return {
    collection: "followUps" as const,
    docId: id,
    data: {
      id,
      trigger: "withdrawalDestination",
      question: "Where did this cash go?",
      dueAtMs: T0 + 86_400_000,
      snoozedUntilMs: null,
      state: "open",
      createdAtMs: T0,
      resolvedAtMs: null,
    },
  } satisfies StageOutput;
};

export const commitWith = (
  output: StageOutput | null,
  nextStatus: StageCommit["nextStatus"] = "normalized",
): StageCommit => ({ nextStatus, outputs: output === null ? [] : [output] });

/** Shared behavior every SourceEventRepository must satisfy. */
export function describeSourceEventContract(
  name: string,
  makeHarness: () => Promise<SourceEventHarness>,
): void {
  describe(`${name} source event contract`, () => {
    let repo: SourceEventRepository;
    let outputsOf: SourceEventHarness["outputsOf"];
    const id: SourceEventId = asSourceEventId("evt-1");

    beforeEach(async () => {
      ({ repo, outputsOf } = await makeHarness());
      await repo.create(alice, inputOf("evt-1"));
    });

    const claimNormalize = async (workerId = "w1", nowMs = T0): Promise<StageClaim> => {
      const r = await repo.claim(alice, id, "normalize", workerId, nowMs);
      if (r.status !== "claimed") throw new Error(`expected claimed, got ${r.reason}`);
      return r.claim;
    };

    it("claims when the status matches and no claim is live", async () => {
      const before = await repo.get(alice, id);
      const claim = await claimNormalize();
      expect(claim).toMatchObject({
        sourceEventId: id,
        stage: "normalize",
        workerId: "w1",
        version: (before?.version ?? -1) + 1,
        stageAttempt: 0,
        leaseExpiresAtMs: T0 + LEASE,
      });
      expect(await repo.get(alice, id)).toMatchObject({
        status: "received",
        version: claim.version,
        claim: { workerId: "w1", stage: "normalize", leaseExpiresAtMs: T0 + LEASE },
      });
    });

    it("refuses a stage whose input status does not match", async () => {
      expect(await repo.claim(alice, id, "interpret", "w1", T0)).toEqual({
        status: "notClaimable",
        reason: "wrongStatus",
      });
    });

    it("refuses an unknown event", async () => {
      expect(await repo.claim(alice, asSourceEventId("nope"), "normalize", "w1", T0)).toEqual({
        status: "notClaimable",
        reason: "notFound",
      });
    });

    it("refuses while a live claim exists, and allows it once the lease expires", async () => {
      await claimNormalize();
      expect(await repo.claim(alice, id, "normalize", "w2", T0 + LEASE - 1)).toEqual({
        status: "notClaimable",
        reason: "liveClaim",
      });
      const second = await repo.claim(alice, id, "normalize", "w2", T0 + LEASE);
      expect(second.status).toBe("claimed");
    });

    it("allows a new claim after reopen, with a higher stageAttempt", async () => {
      const old = await claimNormalize();
      expect(await repo.reopen(alice, id, old.version, T0 + LEASE + 1)).toBe("reopened");
      const next = await repo.claim(alice, id, "normalize", "w2", T0 + LEASE + 2);
      expect(next).toMatchObject({ status: "claimed", claim: { stageAttempt: 1 } });
    });

    it("refuses reopen with a stale version or while the claim is live", async () => {
      const claim = await claimNormalize();
      expect(await repo.reopen(alice, id, claim.version - 1, T0 + LEASE + 1)).toBe("stale");
      expect(await repo.reopen(alice, id, claim.version, T0 + LEASE - 1)).toBe("stale");
      expect(await repo.get(alice, id)).toMatchObject({ stageAttempt: 0, version: claim.version });
    });

    it("reopens a parked event at the stage it was parked from", async () => {
      const c1 = await claimNormalize();
      expect(await repo.commitStage(alice, c1, commitWith(null, "normalized"))).toBe("committed");
      const c2 = await repo.claim(alice, id, "interpret", "w1", T0);
      if (c2.status !== "claimed") throw new Error("expected claimed");
      expect(
        await repo.park(
          alice,
          id,
          c2.claim.version,
          { status: "pending", reason: "aiQuotaExhausted" },
          T0 + LEASE,
        ),
      ).toBe("parked");
      expect(await repo.get(alice, id)).toMatchObject({
        status: "pending",
        pendingReason: "aiQuotaExhausted",
        parkedStage: "interpret",
        claim: null,
        terminalAtMs: null,
      });
      const parked = await repo.get(alice, id);
      expect(await repo.reopen(alice, id, parked?.version ?? -1, T0 + LEASE)).toBe("reopened");
      const reopened = await repo.get(alice, id);
      expect(reopened).toMatchObject({
        status: "normalized",
        parkedStage: null,
        claim: null,
        stageAttempt: 1,
      });
      expect(reopened).not.toHaveProperty("pendingReason");
    });

    it("parks into deadLetter with its reason", async () => {
      const claim = await claimNormalize();
      expect(
        await repo.park(
          alice,
          id,
          claim.version,
          { status: "deadLetter", reason: "attemptsExhausted" },
          T0 + LEASE,
        ),
      ).toBe("parked");
      expect(await repo.get(alice, id)).toMatchObject({
        status: "deadLetter",
        deadLetterReason: "attemptsExhausted",
        parkedStage: "normalize",
      });
    });

    it("refuses to park with a stale version", async () => {
      const claim = await claimNormalize();
      expect(
        await repo.park(
          alice,
          id,
          claim.version + 1,
          { status: "pending", reason: "awaitingClarification" },
          T0 + LEASE,
        ),
      ).toBe("stale");
    });

    it("a commit into pending records the stage so a retry can reopen it", async () => {
      const claim = await claimNormalize();
      expect(
        await repo.commitStage(alice, claim, {
          nextStatus: "pending",
          pendingReason: "awaitingClarification",
          outputs: [],
        }),
      ).toBe("committed");
      const parked = await repo.get(alice, id);
      expect(parked).toMatchObject({ status: "pending", parkedStage: "normalize" });
      expect(await repo.reopen(alice, id, parked?.version ?? -1, T0)).toBe("reopened");
      expect(await repo.get(alice, id)).toMatchObject({ status: "received" });
    });

    it("a late worker commit after reopen is staleClaim and writes no outputs", async () => {
      const old = await claimNormalize();
      await repo.reopen(alice, id, old.version, T0 + LEASE + 1);
      expect(await repo.commitStage(alice, old, commitWith(followUpOutput("evt-1")))).toBe(
        "staleClaim",
      );
      expect(await outputsOf(alice, "followUps")).toHaveLength(0);
      expect(await repo.get(alice, id)).toMatchObject({ status: "received" });
    });

    it("a commit from a replaced claim holder is staleClaim", async () => {
      const first = await claimNormalize("w1");
      await claimNormalize("w2", T0 + LEASE);
      expect(await repo.commitStage(alice, first, commitWith(followUpOutput("evt-1")))).toBe(
        "staleClaim",
      );
      expect(await outputsOf(alice, "followUps")).toHaveLength(0);
    });

    it("lists an expired claim and not a live one", async () => {
      const claim = await claimNormalize();
      expect(await repo.listExpiredClaims(T0 + LEASE - 1, 10)).toEqual([]);
      expect(await repo.listExpiredClaims(T0 + LEASE, 10)).toEqual([
        {
          ownerId: alice,
          sourceEventId: id,
          stage: "normalize",
          version: claim.version,
          stageAttempt: 0,
        },
      ]);
    });

    it("lists expired claims across owners, oldest first, up to the limit", async () => {
      await repo.create(bob, inputOf("evt-b"));
      const b = await repo.claim(bob, asSourceEventId("evt-b"), "normalize", "w1", T0 - 1_000);
      expect(b.status).toBe("claimed");
      await claimNormalize();
      const rows = await repo.listExpiredClaims(T0 + LEASE + 1_000, 10);
      expect(rows.map((r) => r.ownerId)).toEqual([bob, alice]);
      expect(await repo.listExpiredClaims(T0 + LEASE + 1_000, 1)).toHaveLength(1);
    });

    it("commit writes outputs, next status and claim release together", async () => {
      const claim = await claimNormalize();
      expect(await repo.commitStage(alice, claim, commitWith(followUpOutput("evt-1")))).toBe(
        "committed",
      );
      expect(await outputsOf(alice, "followUps")).toHaveLength(1);
      expect(await repo.get(alice, id)).toMatchObject({
        status: "normalized",
        claim: null,
        version: claim.version + 1,
      });
    });

    it("commit with an invalid output writes nothing and keeps the claim", async () => {
      const claim = await claimNormalize();
      const bad: StageOutput = {
        collection: "followUps",
        docId: "evt-1:normalize:followUp",
        data: { id: "evt-1:normalize:followUp" },
      };
      await expect(repo.commitStage(alice, claim, commitWith(bad))).rejects.toThrow();
      expect(await outputsOf(alice, "followUps")).toHaveLength(0);
      expect(await repo.get(alice, id)).toMatchObject({
        status: "received",
        claim: { workerId: "w1" },
      });
    });

    it("commit refuses outputs aimed at the ledger or at sourceEvents", async () => {
      const claim = await claimNormalize();
      for (const collection of ["transactions", "ledgerEntries", "sourceEvents"] as const) {
        const out = { collection, docId: "x", data: {} } satisfies StageOutput;
        await expect(repo.commitStage(alice, claim, commitWith(out))).rejects.toThrow();
      }
      expect(await repo.get(alice, id)).toMatchObject({
        status: "received",
        claim: { workerId: "w1" },
      });
    });

    it("commit refuses an output collection that does not exist", async () => {
      const claim = await claimNormalize();
      const out = { collection: "nope", docId: "x", data: {} } as unknown as StageOutput;
      await expect(repo.commitStage(alice, claim, commitWith(out))).rejects.toThrow();
    });

    it("commit refuses an output doc ID that is not a safe path segment", async () => {
      const claim = await claimNormalize();
      const good = followUpOutput("evt-1");
      const bad: StageOutput = { ...good, docId: "a/b" };
      await expect(repo.commitStage(alice, claim, commitWith(bad))).rejects.toThrow();
      expect(await outputsOf(alice, "followUps")).toHaveLength(0);
    });

    it("commit refuses a pending status without its reason", async () => {
      const claim = await claimNormalize();
      await expect(
        repo.commitStage(alice, claim, { nextStatus: "pending", outputs: [] }),
      ).rejects.toThrow();
    });

    it("sets terminalAtMs only on a terminal status", async () => {
      const claim = await claimNormalize();
      await repo.commitStage(alice, claim, {
        nextStatus: "pending",
        pendingReason: "awaitingClarification",
        outputs: [],
      });
      expect(await repo.get(alice, id)).toMatchObject({ terminalAtMs: null });

      await repo.create(alice, inputOf("evt-2"));
      const r = await repo.claim(alice, asSourceEventId("evt-2"), "normalize", "w1", T0);
      if (r.status !== "claimed") throw new Error("expected claimed");
      await repo.commitStage(alice, r.claim, { nextStatus: "posted", outputs: [] });
      const posted = await repo.get(alice, asSourceEventId("evt-2"));
      expect(posted?.terminalAtMs).toEqual(expect.any(Number));
    });

    it("source hash and idempotency key are owner-scoped", async () => {
      const input = inputOf("evt-x", "key-x", "hash-x");
      expect((await repo.create(alice, input)).status).toBe("created");
      expect((await repo.create(bob, input)).status).toBe("created");
      expect(await repo.create(alice, input)).toEqual({
        status: "duplicate",
        sourceEventId: asSourceEventId("evt-x"),
      });
    });

    it("a new key with an already seen source hash is a duplicate of the first event", async () => {
      const first = inputOf("evt-h1", "key-h1", "hash-shared");
      await repo.create(alice, first);
      expect(await repo.create(alice, inputOf("evt-h2", "key-h2", "hash-shared"))).toEqual({
        status: "duplicate",
        sourceEventId: asSourceEventId("evt-h1"),
      });
      expect(await repo.get(alice, asSourceEventId("evt-h2"))).toBeNull();
    });

    it("rejects an idempotency key reused with a different source hash", async () => {
      await expect(
        repo.create(alice, inputOf("evt-9", "key-evt-1", "other-hash")),
      ).rejects.toMatchObject({ code: "invalidIntent" });
    });

    it("a claim in one owner does not touch another owner's event of the same ID", async () => {
      await repo.create(bob, inputOf("evt-1"));
      await claimNormalize();
      expect(await repo.get(bob, id)).toMatchObject({ claim: null, version: 0 });
    });
  });
}
