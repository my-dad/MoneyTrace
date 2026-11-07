import { describe, expect, it } from "vitest";
import { DEFAULT_RETENTION_POLICY } from "@moneytrace/contracts";
import { asOwnerId, asSourceEventId } from "@moneytrace/domain";
import { createProviderWorld } from "../testing/fake-provider";

const owner = asOwnerId("alice");
const DAY = 86_400_000;
const WINDOW = DEFAULT_RETENTION_POLICY.providerResultDays * DAY;

async function eventWithResult(
  w: ReturnType<typeof createProviderWorld>,
  name: string,
  finish: "rejected" | "pending" | "deadLetter" | null,
) {
  const id = asSourceEventId(name);
  await w.sourceEvents.create(owner, {
    sourceEventId: id,
    sourceType: "sms",
    sourceHash: `h-${name}`,
    idempotencyKey: `k-${name}`,
    receivedAtMs: 1,
  });
  const r = await w.calls.getOrCreate(
    owner,
    { sourceEventId: id, stage: "interpret", providerId: "p" },
    "none",
  );
  await w.calls.beginAttempt(owner, r.id, {}, w.clock.nowMs());
  await w.calls.markSucceeded(owner, r.id, "ok", w.clock.nowMs());
  if (finish !== null) {
    const c = await w.sourceEvents.claim(owner, id, "normalize", "w", w.clock.nowMs());
    if (c.status !== "claimed") throw new Error("claim failed");
    await w.sourceEvents.commitStage(
      owner,
      c.claim,
      finish === "rejected"
        ? { nextStatus: "rejected", outputs: [] }
        : finish === "pending"
          ? { nextStatus: "pending", pendingReason: "awaitingClarification", outputs: [] }
          : { nextStatus: "deadLetter", deadLetterReason: "stageFailed", outputs: [] },
    );
  }
  return { id, callId: r.id };
}

describe("PurgeProviderResults", () => {
  it("skips pending and dead-letter events however old", async () => {
    const w = createProviderWorld();
    const a = await eventWithResult(w, "evt-p", "pending");
    const b = await eventWithResult(w, "evt-d", "deadLetter");
    w.clock.advance(1000 * DAY);
    expect(await w.purge().execute(w.clock.nowMs(), DEFAULT_RETENTION_POLICY, 10)).toEqual({
      purged: 0,
    });
    for (const x of [a, b]) {
      expect((await w.calls.listForStage(owner, x.id, "interpret"))[0]).toMatchObject({
        state: "succeeded",
        result: "ok",
      });
    }
  });

  it("skips a terminal event inside the window", async () => {
    const w = createProviderWorld();
    const a = await eventWithResult(w, "evt-t", "rejected");
    w.clock.advance(WINDOW - 1);
    expect(await w.purge().execute(w.clock.nowMs(), DEFAULT_RETENTION_POLICY, 10)).toEqual({
      purged: 0,
    });
    expect((await w.calls.listForStage(owner, a.id, "interpret"))[0]?.state).toBe("succeeded");
  });

  it("purges past the window: result cleared, state purged, event flagged", async () => {
    const w = createProviderWorld();
    const a = await eventWithResult(w, "evt-t", "rejected");
    w.clock.advance(WINDOW);
    expect(await w.purge().execute(w.clock.nowMs(), DEFAULT_RETENTION_POLICY, 10)).toEqual({
      purged: 1,
    });
    const stored = (await w.calls.listForStage(owner, a.id, "interpret"))[0];
    expect(stored?.state).toBe("purged");
    expect(stored?.result).toBeUndefined();
    expect((await w.sourceEvents.get(owner, a.id))?.providerResultsPurged).toBe(true);
    expect(await w.purge().execute(w.clock.nowMs(), DEFAULT_RETENTION_POLICY, 10)).toEqual({
      purged: 0,
    });
  });

  it("flags a terminal event that never had a provider call, so it leaves the queue", async () => {
    const w = createProviderWorld();
    const id = asSourceEventId("evt-none");
    await w.sourceEvents.create(owner, {
      sourceEventId: id,
      sourceType: "sms",
      sourceHash: "h",
      idempotencyKey: "k",
      receivedAtMs: 1,
    });
    const c = await w.sourceEvents.claim(owner, id, "normalize", "w", w.clock.nowMs());
    if (c.status !== "claimed") throw new Error("claim failed");
    await w.sourceEvents.commitStage(owner, c.claim, { nextStatus: "rejected", outputs: [] });
    w.clock.advance(WINDOW);
    expect(await w.purge().execute(w.clock.nowMs(), DEFAULT_RETENTION_POLICY, 10)).toEqual({
      purged: 0,
    });
    expect((await w.sourceEvents.get(owner, id))?.providerResultsPurged).toBe(true);
  });

  it("respects the limit and continues on the next run", async () => {
    const w = createProviderWorld();
    for (const n of ["a", "b", "c"]) await eventWithResult(w, `evt-${n}`, "rejected");
    w.clock.advance(WINDOW);
    expect(await w.purge().execute(w.clock.nowMs(), DEFAULT_RETENTION_POLICY, 2)).toEqual({
      purged: 2,
    });
    expect(await w.purge().execute(w.clock.nowMs(), DEFAULT_RETENTION_POLICY, 2)).toEqual({
      purged: 1,
    });
  });
});
