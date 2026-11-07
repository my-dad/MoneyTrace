import { describe, expect, it } from "vitest";
import { asOwnerId, asSourceEventId } from "@moneytrace/domain";
import { createProviderWorld } from "../testing/fake-provider";

const owner = asOwnerId("alice");
const id = asSourceEventId("evt-1");
const input = { ownerId: owner, sourceEventId: id, stage: "interpret" as const };

async function parkedUnknown() {
  const w = createProviderWorld();
  await w.sourceEvents.create(owner, {
    sourceEventId: id,
    sourceType: "sms",
    sourceHash: "h",
    idempotencyKey: "k",
    receivedAtMs: 1,
  });
  const n = await w.sourceEvents.claim(owner, id, "normalize", "w", w.clock.nowMs());
  if (n.status !== "claimed") throw new Error("claim failed");
  await w.sourceEvents.commitStage(owner, n.claim, { nextStatus: "normalized", outputs: [] });
  const c = await w.sourceEvents.claim(owner, id, "interpret", "w", w.clock.nowMs());
  if (c.status !== "claimed") throw new Error("claim failed");
  const r = await w.calls.getOrCreate(
    owner,
    { sourceEventId: id, stage: "interpret", providerId: "p" },
    "none",
  );
  await w.calls.beginAttempt(owner, r.id, {}, w.clock.nowMs());
  await w.calls.markUnknown(owner, r.id, 1, "timeout", w.clock.nowMs());
  // The worker parks itself, as runStage work would.
  await w.sourceEvents.commitStage(owner, c.claim, {
    nextStatus: "pending",
    pendingReason: "providerOutcomeUnknown",
    outputs: [],
  });
  return { w, callId: r.id };
}

describe("RetryProviderCall", () => {
  it("approves the unresolved call and reopens an event parked on an unknown outcome", async () => {
    const { w, callId } = await parkedUnknown();
    expect(await w.retry().execute(input)).toBe("reopened");
    expect(await w.sourceEvents.get(owner, id)).toMatchObject({
      status: "normalized",
      claim: null,
      stageAttempt: 1,
    });
    expect(
      (await w.calls.listForStage(owner, id, "interpret")).find((c) => c.id === callId)
        ?.userApprovedRetry,
    ).toBe(true);
  });

  it("reopens a dead-lettered providerResultMissing event", async () => {
    const { w, callId } = await parkedUnknown();
    // Rewrite the parked state as a missing-result dead letter.
    await w.retry().execute(input);
    const c = await w.sourceEvents.claim(owner, id, "interpret", "w", w.clock.nowMs());
    if (c.status !== "claimed") throw new Error("claim failed");
    w.calls.seed(owner, callId, { state: "purged", userApprovedRetry: false });
    await w.sourceEvents.commitStage(owner, c.claim, {
      nextStatus: "deadLetter",
      deadLetterReason: "providerResultMissing",
      outputs: [],
    });
    expect(await w.retry().execute(input)).toBe("reopened");
    expect((await w.calls.listForStage(owner, id, "interpret"))[0]?.userApprovedRetry).toBe(true);
  });

  it.each([
    ["an unknown event", () => ({ ...input, sourceEventId: asSourceEventId("nope") })],
    ["another owner", () => ({ ...input, ownerId: asOwnerId("bob") })],
    ["the wrong stage", () => ({ ...input, stage: "match" as const })],
  ])("is notRetryable for %s", async (_n, make) => {
    const { w } = await parkedUnknown();
    expect(await w.retry().execute(make())).toBe("notRetryable");
  });

  it("is notRetryable for events not parked on an unresolved provider call", async () => {
    const { w } = await parkedUnknown();
    await w.retry().execute(input); // now status normalized, not parked
    expect(await w.retry().execute(input)).toBe("notRetryable");
  });

  it("is notRetryable for an attemptsExhausted dead letter and for plain awaitingClarification", async () => {
    for (const [status, reason] of [
      ["deadLetter", "attemptsExhausted"],
      ["pending", "awaitingClarification"],
    ] as const) {
      const w = createProviderWorld();
      await w.sourceEvents.create(owner, {
        sourceEventId: id,
        sourceType: "sms",
        sourceHash: "h",
        idempotencyKey: "k",
        receivedAtMs: 1,
      });
      const c = await w.sourceEvents.claim(owner, id, "normalize", "w", w.clock.nowMs());
      if (c.status !== "claimed") throw new Error("claim failed");
      await w.sourceEvents.commitStage(
        owner,
        c.claim,
        status === "pending"
          ? { nextStatus: status, pendingReason: reason, outputs: [] }
          : { nextStatus: status, deadLetterReason: reason, outputs: [] },
      );
      expect(await w.retry().execute({ ...input, stage: "normalize" })).toBe("notRetryable");
    }
  });

  it("does not approve or reopen when the parked stage has no unresolved call", async () => {
    const w = createProviderWorld();
    await w.sourceEvents.create(owner, {
      sourceEventId: id,
      sourceType: "sms",
      sourceHash: "h",
      idempotencyKey: "k",
      receivedAtMs: 1,
    });
    const c = await w.sourceEvents.claim(owner, id, "normalize", "w", w.clock.nowMs());
    if (c.status !== "claimed") throw new Error("claim failed");
    await w.sourceEvents.commitStage(owner, c.claim, {
      nextStatus: "pending",
      pendingReason: "providerOutcomeUnknown",
      outputs: [],
    });
    expect(await w.retry().execute({ ...input, stage: "normalize" })).toBe("notRetryable");
    expect((await w.sourceEvents.get(owner, id))?.status).toBe("pending");
  });

  it("approves only the most recently attempted unresolved call", async () => {
    const { w } = await parkedUnknown();
    w.clock.advance(1_000);
    const b = await w.calls.getOrCreate(
      owner,
      { sourceEventId: id, stage: "interpret", providerId: "backup" },
      "none",
    );
    await w.calls.beginAttempt(owner, b.id, {}, w.clock.nowMs());
    await w.calls.markUnknown(owner, b.id, 1, "timeout", w.clock.nowMs());
    expect(await w.retry().execute(input)).toBe("reopened");
    const calls = await w.calls.listForStage(owner, id, "interpret");
    expect(calls.map((c) => [c.providerId, c.userApprovedRetry])).toEqual([
      ["backup", true],
      ["p", false],
    ]);
  });

  it("reopens with no approval when the parked stage already holds a stored result", async () => {
    const { w, callId } = await parkedUnknown();
    await w.calls.markSucceeded(owner, callId, 1, "late", w.clock.nowMs());
    expect(await w.retry().execute(input)).toBe("reopened");
    expect((await w.calls.listForStage(owner, id, "interpret"))[0]).toMatchObject({
      result: "late",
      userApprovedRetry: false,
    });
  });
});
