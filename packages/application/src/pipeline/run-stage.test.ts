import { describe, expect, it } from "vitest";
import { DomainError, asOwnerId, asSourceEventId } from "@moneytrace/domain";
import { CapturingLogger, FakeClock } from "../testing/fakes";
import { InMemorySourceEvents } from "../testing/in-memory-source-events";
import { commitWith, followUpOutput } from "../testing/source-event-contract";
import { PIPELINE_TIMEOUTS } from "./timeouts";
import { runStage } from "./run-stage";

const ownerId = asOwnerId("alice");
const sourceEventId = asSourceEventId("evt-1");

async function setup() {
  const clock = new FakeClock();
  const sourceEvents = new InMemorySourceEvents(clock);
  await sourceEvents.create(ownerId, {
    sourceEventId,
    sourceType: "sms",
    sourceHash: "h",
    idempotencyKey: "k",
    receivedAtMs: clock.nowMs(),
  });
  const logger = new CapturingLogger();
  return { clock, sourceEvents, logger, deps: { sourceEvents, clock, logger } };
}

const base = { ownerId, sourceEventId, stage: "normalize", workerId: "w1" } as const;

describe("PIPELINE_TIMEOUTS", () => {
  it("orders call < function execution < lease", () => {
    expect(PIPELINE_TIMEOUTS.callTimeoutMs).toBeLessThan(
      PIPELINE_TIMEOUTS.functionExecutionTimeoutMs,
    );
    expect(PIPELINE_TIMEOUTS.functionExecutionTimeoutMs).toBeLessThan(PIPELINE_TIMEOUTS.leaseMs);
  });
});

describe("runStage", () => {
  it("claims, runs the work and commits", async () => {
    const { deps, sourceEvents } = await setup();
    const result = await runStage(deps, {
      ...base,
      work: () => Promise.resolve(commitWith(followUpOutput("evt-1"))),
    });
    expect(result).toEqual({ status: "completed" });
    expect(await sourceEvents.get(ownerId, sourceEventId)).toMatchObject({
      status: "normalized",
      claim: null,
    });
  });

  it("skips without running the work when the claim is not available", async () => {
    const { deps } = await setup();
    let ran = 0;
    const work = (): Promise<ReturnType<typeof commitWith>> => {
      ran += 1;
      return Promise.resolve(commitWith(null));
    };
    await runStage(deps, { ...base, work });
    expect(await runStage(deps, { ...base, workerId: "w2", work })).toEqual({ status: "skipped" });
    expect(ran).toBe(1);
  });

  it("leaves the claim for recovery when the work throws", async () => {
    const { deps, sourceEvents } = await setup();
    const result = await runStage(deps, {
      ...base,
      work: () => Promise.reject(new Error("boom with raw text")),
    });
    expect(result).toEqual({ status: "leftForRecovery" });
    expect(await sourceEvents.get(ownerId, sourceEventId)).toMatchObject({
      status: "received",
      claim: { workerId: "w1" },
    });
    expect(sourceEvents.outputsOf(ownerId, "followUps")).toHaveLength(0);
  });

  it("leaves the claim for recovery on retryLater", async () => {
    const { deps, sourceEvents } = await setup();
    const result = await runStage(deps, { ...base, work: () => Promise.resolve("retryLater") });
    expect(result).toEqual({ status: "leftForRecovery" });
    expect(await sourceEvents.get(ownerId, sourceEventId)).toMatchObject({
      claim: { workerId: "w1" },
    });
  });

  it("logs the DomainError code and name, never the message", async () => {
    const { deps, logger } = await setup();
    await runStage(deps, {
      ...base,
      work: () => Promise.reject(new DomainError("invalidIntent", "raw sms text 01712345678")),
    });
    expect(logger.events).toEqual([
      {
        level: "warn",
        event: "pipeline.stageWorkFailed",
        fields: {
          stage: "normalize",
          sourceEventId: "evt-1",
          errorName: "DomainError",
          errorCode: "invalidIntent",
        },
      },
    ]);
  });

  it("logs a plain error by name only", async () => {
    const { deps, logger } = await setup();
    await runStage(deps, { ...base, work: () => Promise.reject(new TypeError("secret")) });
    expect(logger.events[0]?.fields).toEqual({
      stage: "normalize",
      sourceEventId: "evt-1",
      errorName: "TypeError",
    });
  });

  it("a commitStage failure propagates and the claim is kept", async () => {
    const { deps, sourceEvents } = await setup();
    const failing = {
      claim: sourceEvents.claim.bind(sourceEvents),
      commitStage: () => Promise.reject(new Error("commit failed")),
    } as unknown as typeof sourceEvents;
    await expect(
      runStage(
        { ...deps, sourceEvents: failing },
        { ...base, work: () => Promise.resolve(commitWith(null)) },
      ),
    ).rejects.toThrow("commit failed");
    expect(await sourceEvents.get(ownerId, sourceEventId)).toMatchObject({
      status: "received",
      claim: { workerId: "w1" },
    });
  });

  it("reports staleClaim when the stage was reopened during the work", async () => {
    const { deps, clock, sourceEvents } = await setup();
    const result = await runStage(deps, {
      ...base,
      work: async (claim) => {
        clock.advance(PIPELINE_TIMEOUTS.leaseMs + 1);
        expect(
          await sourceEvents.reopen(ownerId, sourceEventId, claim.version, clock.nowMs()),
        ).toBe("reopened");
        return commitWith(followUpOutput("evt-1"));
      },
    });
    expect(result).toEqual({ status: "staleClaim" });
    expect(sourceEvents.outputsOf(ownerId, "followUps")).toHaveLength(0);
  });
});
