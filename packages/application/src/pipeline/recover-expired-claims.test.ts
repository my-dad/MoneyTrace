import { describe, expect, it } from "vitest";
import { asOwnerId, asSourceEventId, type PipelineStage } from "@moneytrace/domain";
import { FakeProvider, createProviderWorld } from "../testing/fake-provider";
import { PIPELINE_TIMEOUTS } from "./timeouts";
import type { RetrySafety } from "@moneytrace/domain";
import { makeReservationId } from "../quota-rules";

const owner = asOwnerId("alice");
const id = asSourceEventId("evt-1");
const LEASE = PIPELINE_TIMEOUTS.leaseMs;

async function claimed(stage: PipelineStage = "normalize") {
  const w = createProviderWorld();
  await w.sourceEvents.create(owner, {
    sourceEventId: id,
    sourceType: "sms",
    sourceHash: "h",
    idempotencyKey: "k",
    receivedAtMs: w.clock.nowMs(),
  });
  // Walk to the stage's input status.
  const order: [PipelineStage, "normalized" | "interpreted"][] = [
    ["normalize", "normalized"],
    ["interpret", "interpreted"],
  ];
  for (const [s, next] of order) {
    if (s === stage) break;
    const c = await w.sourceEvents.claim(owner, id, s, "setup", w.clock.nowMs());
    if (c.status !== "claimed") throw new Error("setup failed");
    await w.sourceEvents.commitStage(owner, c.claim, { nextStatus: next, outputs: [] });
  }
  const c = await w.sourceEvents.claim(owner, id, stage, "w1", w.clock.nowMs());
  if (c.status !== "claimed") throw new Error("claim failed");
  return { w, claim: c.claim };
}

const seed = async (
  w: Awaited<ReturnType<typeof claimed>>["w"],
  retrySafety: RetrySafety,
  stage: PipelineStage = "interpret",
) => {
  const r = await w.calls.getOrCreate(
    owner,
    { sourceEventId: id, stage, providerId: "p" },
    retrySafety,
  );
  await w.calls.beginAttempt(owner, r.id, {}, w.clock.nowMs());
  return r;
};

describe("RecoverExpiredClaims", () => {
  it("does nothing while the lease is live", async () => {
    const { w } = await claimed("interpret");
    await seed(w, "none");
    w.clock.advance(LEASE - 1);
    expect(await w.recovery().execute(w.clock.nowMs(), 10)).toEqual({
      reopened: 0,
      parked: 0,
      deadLettered: 0,
    });
  });

  it("started plus an expired lease on a none provider: unknown, parked pending, not reopened", async () => {
    const { w } = await claimed("interpret");
    const r = await seed(w, "none");
    w.clock.advance(LEASE);
    expect(await w.recovery().execute(w.clock.nowMs(), 10)).toEqual({
      reopened: 0,
      parked: 1,
      deadLettered: 0,
    });
    expect(await w.sourceEvents.get(owner, id)).toMatchObject({
      status: "pending",
      pendingReason: "providerOutcomeUnknown",
      parkedStage: "interpret",
      claim: null,
    });
    expect(
      (await w.calls.listForStage(owner, id, "interpret")).find((c) => c.id === r.id)?.state,
    ).toBe("unknown");
  });

  it("succeeded with no result on a non-terminal event: dead-lettered providerResultMissing", async () => {
    const { w } = await claimed("interpret");
    const r = await seed(w, "none");
    await w.calls.markSucceeded(owner, r.id, 1, "ok", w.clock.nowMs());
    w.calls.seed(owner, r.id, { state: "succeeded" });
    w.clock.advance(LEASE);
    expect(await w.recovery().execute(w.clock.nowMs(), 10)).toEqual({
      reopened: 0,
      parked: 0,
      deadLettered: 1,
    });
    expect(await w.sourceEvents.get(owner, id)).toMatchObject({
      status: "deadLetter",
      deadLetterReason: "providerResultMissing",
    });
  });

  it.each<RetrySafety>(["idempotentKey", "localPure"])(
    "started on a %s provider: reopened with a higher attempt",
    async (safety) => {
      const { w } = await claimed("interpret");
      await seed(w, safety);
      w.clock.advance(LEASE);
      expect(await w.recovery().execute(w.clock.nowMs(), 10)).toEqual({
        reopened: 1,
        parked: 0,
        deadLettered: 0,
      });
      expect(await w.sourceEvents.get(owner, id)).toMatchObject({
        status: "normalized",
        stageAttempt: 1,
        claim: null,
      });
    },
  );

  it("no provider call on the stage: reopened", async () => {
    const { w } = await claimed();
    w.clock.advance(LEASE);
    expect(await w.recovery().execute(w.clock.nowMs(), 10)).toEqual({
      reopened: 1,
      parked: 0,
      deadLettered: 0,
    });
    expect((await w.sourceEvents.get(owner, id))?.status).toBe("received");
  });

  it("stageAttempt at maxAttempts: dead-lettered attemptsExhausted", async () => {
    const { w } = await claimed();
    for (let i = 0; i < PIPELINE_TIMEOUTS.maxAttempts; i++) {
      w.clock.advance(LEASE);
      await w.recovery().execute(w.clock.nowMs(), 10);
      const c = await w.sourceEvents.claim(owner, id, "normalize", "w", w.clock.nowMs());
      if (c.status !== "claimed") throw new Error("claim failed");
    }
    w.clock.advance(LEASE);
    expect(await w.recovery().execute(w.clock.nowMs(), 10)).toEqual({
      reopened: 0,
      parked: 0,
      deadLettered: 1,
    });
    expect(await w.sourceEvents.get(owner, id)).toMatchObject({
      status: "deadLetter",
      deadLetterReason: "attemptsExhausted",
    });
  });

  it("a late worker's success is stored; a retry reopens with no approval and no second call", async () => {
    const provider = new FakeProvider("p", "none");
    const { w, claim } = await claimed("interpret");
    const r = await seed(w, "none");
    w.clock.advance(LEASE);
    await w.recovery().execute(w.clock.nowMs(), 10);
    expect(await w.sourceEvents.get(owner, id)).toMatchObject({
      status: "pending",
      pendingReason: "providerOutcomeUnknown",
    });
    // The late worker finally gets its response, after recovery parked the event.
    await w.calls.markSucceeded(owner, r.id, 1, "late", w.clock.nowMs());
    expect(
      await w.sourceEvents.commitStage(owner, claim, { nextStatus: "interpreted", outputs: [] }),
    ).toBe("staleClaim");
    expect(await w.retry().execute({ ownerId: owner, sourceEventId: id, stage: "interpret" })).toBe(
      "reopened",
    );
    expect((await w.calls.listForStage(owner, id, "interpret"))[0]).toMatchObject({
      state: "succeeded",
      result: "late",
      userApprovedRetry: false,
    });
    const c = await w.sourceEvents.claim(owner, id, "interpret", "w2", w.clock.nowMs());
    if (c.status !== "claimed") throw new Error("claim failed");
    const result = await w.executor().execute({
      ownerId: owner,
      sourceEventId: id,
      stage: "interpret",
      provider: { id: "p", retrySafety: "none" },
      estimateMicroUsd: 100,
      invoke: provider.invoke,
    });
    expect(result).toMatchObject({ kind: "result", value: "late", retriedAfterUnknown: false });
    expect(provider.calls).toBe(0);
    expect(
      await w.sourceEvents.commitStage(owner, c.claim, { nextStatus: "interpreted", outputs: [] }),
    ).toBe("committed");
  });

  it("meters a died worker's attempt as unknown, with the reserved estimate; a real row replaces it", async () => {
    const { w } = await claimed("interpret");
    const r = await w.calls.getOrCreate(
      owner,
      { sourceEventId: id, stage: "interpret", providerId: "p" },
      "none",
    );
    await w.calls.beginAttempt(
      owner,
      r.id,
      { reservationId: makeReservationId(4_000, 1, "x") },
      w.clock.nowMs(),
    );
    w.clock.advance(LEASE);
    await w.recovery().execute(w.clock.nowMs(), 10);
    expect(w.usage.all(owner)).toEqual([
      expect.objectContaining({
        id: `${r.id}:1`,
        outcome: "unknown",
        errorCode: "workerDied",
        estimatedMicroUsd: 4_000,
      }),
    ]);
    // The late worker's own row has the same ID and replaces the placeholder.
    await w.usage.append(owner, {
      ...(w.usage.all(owner)[0] as NonNullable<ReturnType<typeof w.usage.all>[number]>),
      outcome: "success",
      actualMicroUsd: 3_000,
    });
    expect(w.usage.all(owner)).toHaveLength(1);
    expect(w.usage.all(owner)[0]).toMatchObject({ outcome: "success", actualMicroUsd: 3_000 });
  });

  it("a user-approved retry is not blocked by an attempts-exhausted stage", async () => {
    const provider = new FakeProvider("p", "none");
    provider.script({ kind: "success", value: "approved" });
    const { w } = await claimed("interpret");
    await seed(w, "none");
    // Drive the stage to the attempt limit through recovery cycles that each park on unknown.
    w.clock.advance(LEASE);
    await w.recovery().execute(w.clock.nowMs(), 10);
    expect(await w.sourceEvents.get(owner, id)).toMatchObject({
      status: "pending",
      stageAttempt: 0,
    });
    // Retry, then crash before invoking, until the stage is out of attempts. The approval stays set.
    expect(await w.retry().execute({ ownerId: owner, sourceEventId: id, stage: "interpret" })).toBe(
      "reopened",
    );
    for (let i = 0; i < PIPELINE_TIMEOUTS.maxAttempts; i++) {
      const c = await w.sourceEvents.claim(owner, id, "interpret", "w", w.clock.nowMs());
      if (c.status !== "claimed") throw new Error("claim failed");
      w.clock.advance(LEASE);
      const out = await w.recovery().execute(w.clock.nowMs(), 10);
      expect(out.deadLettered).toBe(0);
      if ((await w.sourceEvents.get(owner, id))?.status === "pending") break;
    }
    const event = await w.sourceEvents.get(owner, id);
    expect(event?.stageAttempt).toBeGreaterThanOrEqual(PIPELINE_TIMEOUTS.maxAttempts);
    expect(event).toMatchObject({ status: "pending", pendingReason: "providerOutcomeUnknown" });
    // One more user retry still runs the provider.
    expect(await w.retry().execute({ ownerId: owner, sourceEventId: id, stage: "interpret" })).toBe(
      "reopened",
    );
    const c = await w.sourceEvents.claim(owner, id, "interpret", "w", w.clock.nowMs());
    if (c.status !== "claimed") throw new Error("claim failed");
    const result = await w.executor().execute({
      ownerId: owner,
      sourceEventId: id,
      stage: "interpret",
      provider: { id: "p", retrySafety: "none" },
      estimateMicroUsd: 100,
      invoke: provider.invoke,
    });
    expect(result).toMatchObject({ kind: "result", value: "approved", retriedAfterUnknown: true });
    expect(provider.calls).toBe(1);
  });

  it("handles several expired claims and respects the limit", async () => {
    const w = createProviderWorld();
    for (const n of ["a", "b", "c"]) {
      await w.sourceEvents.create(owner, {
        sourceEventId: asSourceEventId(`evt-${n}`),
        sourceType: "sms",
        sourceHash: `h${n}`,
        idempotencyKey: `k${n}`,
        receivedAtMs: 1,
      });
      await w.sourceEvents.claim(
        owner,
        asSourceEventId(`evt-${n}`),
        "normalize",
        "w",
        w.clock.nowMs(),
      );
    }
    w.clock.advance(LEASE);
    expect(await w.recovery().execute(w.clock.nowMs(), 2)).toEqual({
      reopened: 2,
      parked: 0,
      deadLettered: 0,
    });
    expect(await w.recovery().execute(w.clock.nowMs(), 2)).toEqual({
      reopened: 1,
      parked: 0,
      deadLettered: 0,
    });
  });

  it("skips a stale expired-claim row: a live attempt is not marked unknown", async () => {
    const { w, claim } = await claimed("interpret");
    const r = await seed(w, "none");
    w.clock.advance(LEASE);
    const stale = await w.sourceEvents.listExpiredClaims(w.clock.nowMs(), 10);
    expect(stale).toHaveLength(1);
    // The row is read, then another recovery reopens and a new worker starts attempt 2.
    expect(await w.sourceEvents.reopen(owner, id, claim.version, w.clock.nowMs())).toBe("reopened");
    await w.calls.markFailed(owner, r.id, 1, "rejected", w.clock.nowMs());
    const live = await w.sourceEvents.claim(owner, id, "interpret", "w2", w.clock.nowMs());
    if (live.status !== "claimed") throw new Error("claim failed");
    await w.calls.beginAttempt(owner, r.id, {}, w.clock.nowMs());
    w.sourceEvents.listExpiredClaims = () => Promise.resolve(stale);
    expect(await w.recovery().execute(w.clock.nowMs(), 10)).toEqual({
      reopened: 0,
      parked: 0,
      deadLettered: 0,
    });
    expect((await w.calls.listForStage(owner, id, "interpret"))[0]?.state).toBe("started");
    expect(w.usage.all(owner)).toHaveLength(0);
  });

  it("meters the attempt of a worker that died after a late success from an older attempt", async () => {
    const { w } = await claimed("interpret");
    const r = await w.calls.getOrCreate(
      owner,
      { sourceEventId: id, stage: "interpret", providerId: "p" },
      "none",
    );
    await w.calls.beginAttempt(owner, r.id, {}, w.clock.nowMs());
    await w.calls.markUnknown(owner, r.id, 1, "timeout", w.clock.nowMs());
    await w.calls.approveRetry(owner, r.id, w.clock.nowMs());
    await w.calls.beginAttempt(
      owner,
      r.id,
      { reservationId: makeReservationId(4_000, 1, "x") },
      w.clock.nowMs(),
    );
    await w.calls.markSucceeded(owner, r.id, 1, "A", w.clock.nowMs());
    w.clock.advance(LEASE);
    await w.recovery().execute(w.clock.nowMs(), 10);
    expect(w.usage.all(owner)).toEqual([
      expect.objectContaining({
        id: `${r.id}:2`,
        outcome: "unknown",
        errorCode: "workerDied",
        estimatedMicroUsd: 4_000,
        userApprovedRetry: true,
      }),
    ]);
  });

  it("never overwrites a real row with a placeholder", async () => {
    const { w } = await claimed("interpret");
    const r = await seed(w, "none");
    await w.usage.append(owner, {
      id: `${r.id}:1`,
      providerId: "p",
      estimatedMicroUsd: 9,
      outcome: "unknown",
      errorCode: "timeout",
      userApprovedRetry: false,
      sourceEventId: id,
      stage: "interpret",
      attempt: 1,
      createdAtMs: 1,
    });
    w.clock.advance(LEASE);
    await w.recovery().execute(w.clock.nowMs(), 10);
    expect(w.usage.all(owner)).toEqual([expect.objectContaining({ errorCode: "timeout" })]);
  });

  it("reopens rather than dead-letters a stage that holds a stored result, with no provider call", async () => {
    const provider = new FakeProvider("p", "none");
    const { w } = await claimed("interpret");
    for (let i = 0; i < PIPELINE_TIMEOUTS.maxAttempts; i++) {
      w.clock.advance(LEASE);
      await w.recovery().execute(w.clock.nowMs(), 10);
      const c = await w.sourceEvents.claim(owner, id, "interpret", "w", w.clock.nowMs());
      if (c.status !== "claimed") throw new Error("claim failed");
    }
    expect((await w.sourceEvents.get(owner, id))?.stageAttempt).toBe(PIPELINE_TIMEOUTS.maxAttempts);
    const r = await seed(w, "none");
    await w.calls.markSucceeded(owner, r.id, 1, "stored", w.clock.nowMs());
    w.clock.advance(LEASE);
    expect(await w.recovery().execute(w.clock.nowMs(), 10)).toEqual({
      reopened: 1,
      parked: 0,
      deadLettered: 0,
    });
    const c = await w.sourceEvents.claim(owner, id, "interpret", "w", w.clock.nowMs());
    if (c.status !== "claimed") throw new Error("claim failed");
    const result = await w.executor().execute({
      ownerId: owner,
      sourceEventId: id,
      stage: "interpret",
      provider: { id: "p", retrySafety: "none" },
      estimateMicroUsd: 100,
      invoke: provider.invoke,
    });
    expect(result).toMatchObject({ kind: "result", value: "stored" });
    expect(provider.calls).toBe(0);
  });

  it("a late success from attempt 1 after an approved attempt 2 is marked retriedAfterUnknown", async () => {
    const provider = new FakeProvider("p", "none");
    const { w } = await claimed("interpret");
    const r = await seed(w, "none");
    await w.calls.markUnknown(owner, r.id, 1, "timeout", w.clock.nowMs());
    await w.calls.approveRetry(owner, r.id, w.clock.nowMs());
    await w.calls.beginAttempt(owner, r.id, {}, w.clock.nowMs());
    await w.calls.markSucceeded(owner, r.id, 1, "A", w.clock.nowMs());
    const result = await w.executor().execute({
      ownerId: owner,
      sourceEventId: id,
      stage: "interpret",
      provider: { id: "p", retrySafety: "none" },
      estimateMicroUsd: 100,
      invoke: provider.invoke,
    });
    expect(result).toMatchObject({ kind: "result", value: "A", retriedAfterUnknown: true });
    expect(provider.calls).toBe(0);
  });

  it("dead-letters a stage that keeps crashing after reusing a stored result, at twice the attempt limit", async () => {
    const max = PIPELINE_TIMEOUTS.maxAttempts;
    const { w } = await claimed("interpret");
    const r = await seed(w, "none");
    await w.calls.markSucceeded(owner, r.id, 1, "stored", w.clock.nowMs());
    // Every claim's worker dies before committing; only the lease expiry moves the stage on.
    for (let round = 0; round < max * 3; round++) {
      w.clock.advance(LEASE);
      await w.recovery().execute(w.clock.nowMs(), 10);
      const event = await w.sourceEvents.get(owner, id);
      if (event?.status === "deadLetter") break;
      const c = await w.sourceEvents.claim(owner, id, "interpret", "w", w.clock.nowMs());
      if (c.status !== "claimed") throw new Error("claim failed");
    }
    const event = await w.sourceEvents.get(owner, id);
    expect(event).toMatchObject({ status: "deadLetter", deadLetterReason: "attemptsExhausted" });
    expect(event?.stageAttempt).toBe(max * 2);
  });
});
