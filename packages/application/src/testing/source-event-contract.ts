import { beforeEach, describe, expect, it } from "vitest";
import type { OwnerCollectionName } from "@moneytrace/contracts";
import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
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
const candidate = {
  kind: "purchase" as const,
  amountMinor: 5000,
  currency: "BDT",
  occurredAtMs: T0,
};

const inputOf = (id: string, key = `key-${id}`, hash = `hash-${id}`): SourceEventInput => ({
  sourceEventId: asSourceEventId(id),
  sourceType: "sms",
  sourceHash: hash,
  idempotencyKey: key,
  receivedAtMs: T0,
  retainedText: "Tk 100 paid",
});

/** A follow-up output with the deterministic ID a stage would use. */
export const followUpOutput = (
  eventId: string,
  stage: "match" | "normalize" = "normalize",
  question = "Where did this cash go?",
) => {
  const id = stageOutputId(eventId, stage, "followUp");
  return {
    collection: "followUps" as const,
    docId: id,
    data: {
      id,
      trigger: "withdrawalDestination",
      question,
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

    it("refuses while any claim is held, even an expired one: only reopen clears it", async () => {
      const first = await claimNormalize();
      expect(await repo.claim(alice, id, "normalize", "w2", T0 + LEASE - 1)).toEqual({
        status: "notClaimable",
        reason: "liveClaim",
      });
      expect(await repo.claim(alice, id, "normalize", "w2", T0 + LEASE)).toEqual({
        status: "notClaimable",
        reason: "liveClaim",
      });
      expect(await repo.get(alice, id)).toMatchObject({
        stageAttempt: 0,
        version: first.version,
        claim: { workerId: "w1" },
      });
    });

    it("repeated crashes cannot go past the attempt count without a reopen", async () => {
      await claimNormalize();
      for (let i = 1; i <= 8; i++) {
        const r = await repo.claim(alice, id, "normalize", `w${String(i)}`, T0 + LEASE * (i + 1));
        expect(r.status).toBe("notClaimable");
      }
      expect(await repo.get(alice, id)).toMatchObject({ stageAttempt: 0 });
    });

    it("a re-claim by the same worker after reopen does not revive the old claim", async () => {
      const old = await claimNormalize("w1");
      await repo.reopen(alice, id, old.version, T0 + LEASE);
      const fresh = await claimNormalize("w1", T0 + LEASE);
      expect(fresh.version).toBeGreaterThan(old.version);
      expect(await repo.commitStage(alice, old, commitWith(followUpOutput("evt-1")))).toBe(
        "staleClaim",
      );
      expect(await outputsOf(alice, "followUps")).toHaveLength(0);
      expect(await repo.commitStage(alice, fresh, commitWith(null))).toBe("committed");
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

    it("a commit from a reopened and re-claimed holder is staleClaim", async () => {
      const first = await claimNormalize("w1");
      await repo.reopen(alice, id, first.version, T0 + LEASE);
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

    it("commit refuses every collection outside the output allowlist", async () => {
      const claim = await claimNormalize();
      const allowed = ["followUps", "decisionRecords", "conversationMessages", "aiUsage"];
      const excluded = Object.keys(OWNER_COLLECTIONS).filter((c) => !allowed.includes(c));
      expect(excluded.length).toBeGreaterThan(10);
      for (const collection of excluded) {
        const out = {
          collection,
          docId: stageOutputId("evt-1", "normalize", "x"),
          data: {},
        } as unknown as StageOutput;
        await expect(repo.commitStage(alice, claim, commitWith(out))).rejects.toMatchObject({
          code: "invalidIntent",
        });
      }
      expect(await repo.get(alice, id)).toMatchObject({
        status: "received",
        claim: { workerId: "w1" },
      });
    });

    it("commit refuses an output whose doc ID is not prefixed by event and stage", async () => {
      const claim = await claimNormalize();
      for (const docId of ["other:normalize:followUp", "evt-1:match:followUp", "evt-1:normalize"]) {
        const bad: StageOutput = { ...followUpOutput("evt-1"), docId };
        await expect(repo.commitStage(alice, claim, commitWith(bad))).rejects.toMatchObject({
          code: "invalidIntent",
        });
      }
      expect(await outputsOf(alice, "followUps")).toHaveLength(0);
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

    it("reports idempotencyConflict for a key reused with a different source hash", async () => {
      expect(await repo.create(alice, inputOf("evt-9", "key-evt-1", "other-hash"))).toEqual({
        status: "idempotencyConflict",
      });
      expect(await repo.get(alice, asSourceEventId("evt-9"))).toBeNull();
    });

    it("never resets an existing event on an ID collision", async () => {
      const claim = await claimNormalize();
      await repo.commitStage(alice, claim, { nextStatus: "posted", outputs: [] });
      const before = await repo.get(alice, id);
      await expect(
        repo.create(alice, inputOf("evt-1", "fresh-key", "fresh-hash")),
      ).rejects.toMatchObject({ code: "invalidIntent" });
      expect(await repo.get(alice, id)).toEqual(before);
      expect(
        await repo.create(alice, inputOf("evt-other", "fresh-key", "fresh-hash")),
      ).toMatchObject({ status: "created" });
    });

    it("parallel creates of one input produce one event", async () => {
      const input = inputOf("evt-par", "key-par", "hash-par");
      const results = await Promise.all(
        Array.from({ length: 10 }, () => repo.create(alice, input)),
      );
      expect(results.filter((r) => r.status === "created")).toHaveLength(1);
      expect(results.filter((r) => r.status === "duplicate")).toHaveLength(9);
    }, 120_000);

    it("validates worker ID and idempotency inputs the same way everywhere", async () => {
      await expect(repo.claim(alice, id, "normalize", "", T0)).rejects.toMatchObject({
        code: "invalidIntent",
      });
      await expect(repo.claim(alice, id, "normalize", "w".repeat(129), T0)).rejects.toMatchObject({
        code: "invalidIntent",
      });
      for (const bad of [
        inputOf("evt-v1", "a/b"),
        inputOf("evt-v2", ""),
        inputOf("evt-v3", "k", ""),
        inputOf("evt-v4", "k", "h".repeat(129)),
      ]) {
        await expect(repo.create(alice, bad)).rejects.toMatchObject({ code: "invalidIntent" });
      }
    });

    it("a claim in one owner does not touch another owner's event of the same ID", async () => {
      await repo.create(bob, inputOf("evt-1"));
      await claimNormalize();
      expect(await repo.get(bob, id)).toMatchObject({ claim: null, version: 0 });
    });

    it("keeps an output that already exists and still advances the status", async () => {
      const first = await claimNormalize();
      await repo.commitStage(alice, first, {
        nextStatus: "pending",
        pendingReason: "awaitingClarification",
        outputs: [followUpOutput("evt-1", "normalize", "original answer")],
      });
      const parked = await repo.get(alice, id);
      await repo.reopen(alice, id, parked?.version ?? -1, T0);
      const again = await claimNormalize("w2", T0);
      expect(
        await repo.commitStage(
          alice,
          again,
          commitWith(followUpOutput("evt-1", "normalize", "overwritten")),
        ),
      ).toBe("committed");
      const docs = await outputsOf(alice, "followUps");
      expect(docs).toHaveLength(1);
      expect(docs[0]).toMatchObject({ question: "original answer" });
      expect(await repo.get(alice, id)).toMatchObject({ status: "normalized" });
    });

    it("stageAttempt is per stage: it resets on advance and is kept across parking", async () => {
      const c1 = await claimNormalize();
      await repo.reopen(alice, id, c1.version, T0 + LEASE);
      const c2 = await claimNormalize("w2", T0 + LEASE);
      expect(c2.stageAttempt).toBe(1);
      await repo.commitStage(alice, c2, {
        nextStatus: "pending",
        pendingReason: "awaitingClarification",
        outputs: [],
      });
      expect(await repo.get(alice, id)).toMatchObject({ stageAttempt: 1 });
      const parked = await repo.get(alice, id);
      await repo.reopen(alice, id, parked?.version ?? -1, T0);
      expect(await repo.get(alice, id)).toMatchObject({ stageAttempt: 2 });
      const c3 = await claimNormalize("w3", T0);
      await repo.commitStage(alice, c3, commitWith(null, "normalized"));
      expect(await repo.get(alice, id)).toMatchObject({ stageAttempt: 0 });
    });

    it("refuses to reopen a terminal event", async () => {
      const claim = await claimNormalize();
      await repo.commitStage(alice, claim, { nextStatus: "posted", outputs: [] });
      const done = await repo.get(alice, id);
      expect(await repo.reopen(alice, id, done?.version ?? -1, T0 + LEASE)).toBe("stale");
      expect(await repo.get(alice, id)).toMatchObject({ status: "posted" });
    });

    it("refuses to reopen an event with neither a claim nor a parked stage", async () => {
      expect(await repo.reopen(alice, id, 0, T0)).toBe("stale");
      expect(await repo.get(alice, id)).toMatchObject({ status: "received", version: 0 });
    });

    it("refuses to park an event that holds no claim", async () => {
      expect(
        await repo.park(alice, id, 0, { status: "pending", reason: "awaitingClarification" }, T0),
      ).toBe("stale");
    });

    it("a late commit after park is staleClaim and writes no outputs", async () => {
      const claim = await claimNormalize();
      await repo.park(
        alice,
        id,
        claim.version,
        { status: "deadLetter", reason: "stageFailed" },
        T0 + LEASE,
      );
      expect(await repo.commitStage(alice, claim, commitWith(followUpOutput("evt-1")))).toBe(
        "staleClaim",
      );
      expect(await outputsOf(alice, "followUps")).toHaveLength(0);
      expect(await repo.get(alice, id)).toMatchObject({ status: "deadLetter" });
    });

    it("clears deadLetterReason on reopen", async () => {
      const claim = await claimNormalize();
      await repo.park(
        alice,
        id,
        claim.version,
        { status: "deadLetter", reason: "stageFailed" },
        T0 + LEASE,
      );
      const parked = await repo.get(alice, id);
      await repo.reopen(alice, id, parked?.version ?? -1, T0 + LEASE);
      const reopened = await repo.get(alice, id);
      expect(reopened).toMatchObject({ status: "received" });
      expect(reopened).not.toHaveProperty("deadLetterReason");
    });
    it("eventPatch commits with the status", async () => {
      const claim = await claimNormalize();
      await repo.commitStage(alice, claim, {
        ...commitWith(null),
        eventPatch: { retainedText: "masked", resolvedAccountId: "acct-1" },
      });
      expect(await repo.get(alice, id)).toMatchObject({
        status: "normalized",
        retainedText: "masked",
        resolvedAccountId: "acct-1",
      });
    });

    it("eventPatch is discarded on a stale claim", async () => {
      const claim = await claimNormalize();
      await repo.reopen(alice, id, claim.version, T0 + LEASE);
      expect(
        await repo.commitStage(alice, claim, {
          ...commitWith(null),
          eventPatch: { retainedText: "late" },
        }),
      ).toBe("staleClaim");
      expect(await repo.get(alice, id)).toMatchObject({ retainedText: "Tk 100 paid" });
    });

    it("keeps eventPatch fields across later transitions", async () => {
      const claim = await claimNormalize();
      await repo.commitStage(alice, claim, {
        nextStatus: "pending",
        pendingReason: "awaitingClarification",
        outputs: [],
        eventPatch: { candidate },
      });
      const parked = await repo.get(alice, id);
      await repo.reopen(alice, id, parked?.version ?? -1, T0);
      expect(await repo.get(alice, id)).toMatchObject({ status: "received", candidate });
    });

    it("applyUserDecision records the answer on a pending event without changing status", async () => {
      const claim = await claimNormalize();
      await repo.commitStage(alice, claim, {
        nextStatus: "pending",
        pendingReason: "awaitingClarification",
        outputs: [],
      });
      expect(
        await repo.applyUserDecision(alice, id, {
          candidate,
          userConfirmed: true,
          resolvedAccountId: "acct-9",
        }),
      ).toBe("applied");
      expect(await repo.get(alice, id)).toMatchObject({
        status: "pending",
        userConfirmed: true,
        resolvedAccountId: "acct-9",
        candidate,
      });
    });

    it("applyUserDecision is refused unless the event is pending", async () => {
      expect(await repo.applyUserDecision(alice, id, { candidate, userConfirmed: true })).toBe(
        "stale",
      );
      expect(await repo.get(alice, id)).toMatchObject({ userConfirmed: false, candidate: null });
    });

    it("a candidate with an unknown currency round-trips", async () => {
      const claim = await claimNormalize();
      const usd = { ...candidate, currency: "USD" };
      await repo.commitStage(alice, claim, { ...commitWith(null), eventPatch: { candidate: usd } });
      expect(await repo.get(alice, id)).toMatchObject({ candidate: usd });
    });

    it("finishParked ends a pending event and sets terminalAtMs", async () => {
      const claim = await claimNormalize();
      await repo.commitStage(alice, claim, {
        nextStatus: "pending",
        pendingReason: "awaitingClarification",
        outputs: [],
      });
      expect(await repo.finishParked(alice, id, "rejected", T0 + 5)).toBe("finished");
      const done = await repo.get(alice, id);
      expect(done).toMatchObject({ status: "rejected", terminalAtMs: T0 + 5, parkedStage: null });
      expect(done).not.toHaveProperty("pendingReason");
    });

    it("finishParked is refused on an event that is running or already finished", async () => {
      expect(await repo.finishParked(alice, id, "cancelled", T0)).toBe("stale");
      const claim = await claimNormalize();
      expect(await repo.finishParked(alice, id, "cancelled", T0)).toBe("stale");
      await repo.commitStage(alice, claim, {
        nextStatus: "pending",
        pendingReason: "awaitingClarification",
        outputs: [],
      });
      await repo.finishParked(alice, id, "cancelled", T0);
      expect(await repo.finishParked(alice, id, "rejected", T0)).toBe("stale");
      expect(await repo.get(alice, id)).toMatchObject({ status: "cancelled" });
    });

    it("lists parked events by reason, oldest first, across owners", async () => {
      const park = async (
        owner: OwnerId,
        name: string,
        at: number,
        reason: "aiQuotaExhausted" | "awaitingClarification",
      ) => {
        const sourceEventId = asSourceEventId(name);
        await repo.create(owner, { ...inputOf(name), receivedAtMs: at });
        const claimed = await repo.claim(owner, sourceEventId, "normalize", "w", at);
        if (claimed.status !== "claimed") throw new Error("not claimed");
        await repo.commitStage(owner, claimed.claim, {
          nextStatus: "pending",
          pendingReason: reason,
          outputs: [],
        });
      };
      await park(alice, "late", T0 + 2, "aiQuotaExhausted");
      await park(bob, "early", T0 + 1, "aiQuotaExhausted");
      await park(alice, "other", T0, "awaitingClarification");
      const rows = await repo.listPendingByReason("aiQuotaExhausted", 10);
      expect(rows.map((r) => [r.ownerId, r.sourceEventId])).toEqual([
        [bob, "early"],
        [alice, "late"],
      ]);
      expect(await repo.listPendingByReason("aiQuotaExhausted", 1)).toHaveLength(1);
    });
  });
}
