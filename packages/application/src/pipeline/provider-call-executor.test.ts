import { describe, expect, it } from "vitest";
import { asOwnerId, asSourceEventId } from "@moneytrace/domain";
import {
  FakeProvider,
  abortedSignal,
  controllableSignal,
  createProviderWorld,
  liveSignal,
} from "../testing/fake-provider";
import { PIPELINE_TIMEOUTS } from "./timeouts";
import { DEFAULT_QUOTA_LIMITS } from "../ports/quota-ledger";
import { makeReservationId } from "../quota-rules";

const owner = asOwnerId("alice");
const sourceEventId = asSourceEventId("evt-1");
const ESTIMATE = 10_000;

function setup(provider = new FakeProvider("deepseek", "none")) {
  const w = createProviderWorld();
  const params = {
    ownerId: owner,
    sourceEventId,
    stage: "interpret" as const,
    provider,
    estimateMicroUsd: ESTIMATE,
    invoke: provider.invoke,
  };
  return { w, provider, params, executor: w.executor() };
}

const stored = async (w: ReturnType<typeof createProviderWorld>, providerId = "deepseek") =>
  (await w.calls.listForStage(owner, sourceEventId, "interpret")).find(
    (c) => c.providerId === providerId,
  );

describe("ProviderCallExecutor", () => {
  it("reuses a stored result after a lost stage commit and calls the provider once", async () => {
    const { w, provider, params, executor } = setup();
    expect(await executor.execute(params)).toMatchObject({ kind: "result", value: "ok" });
    // The stage commit is simulated as failed: nothing else is written.
    const retry = await w.executor().execute(params);
    expect(retry).toMatchObject({ kind: "result", value: "ok", retriedAfterUnknown: false });
    expect(provider.calls).toBe(1);
  });

  it("writes the attempt before invoking the provider", async () => {
    const { w, provider, params, executor } = setup();
    let seen: unknown;
    provider.onInvoke = async () => {
      seen = await stored(w);
    };
    await executor.execute(params);
    expect(seen).toMatchObject({ state: "started", attemptCount: 1 });
  });

  it("sends the same requestKey on every attempt", async () => {
    const provider = new FakeProvider("deepseek", "idempotentKey");
    const { params, executor } = setup(provider);
    provider.script({ kind: "unknown", code: "connectionReset" }, { kind: "success", value: "ok" });
    expect((await executor.execute(params)).kind).toBe("retryLater");
    expect(await executor.execute(params)).toMatchObject({ kind: "result", value: "ok" });
    expect(provider.keys).toHaveLength(2);
    expect(provider.keys[0]).toBe(provider.keys[1]);
    expect(provider.keys[0]).toBe("evt-1:interpret:deepseek");
  });

  it("a none provider with an unknown outcome is never retried automatically", async () => {
    const { provider, params, executor } = setup();
    provider.script({ kind: "unknown", code: "timeout" });
    expect((await executor.execute(params)).kind).toBe("awaitUserDecision");
    expect((await executor.execute(params)).kind).toBe("awaitUserDecision");
    expect(provider.calls).toBe(1);
  });

  it("a thrown error becomes unknown, not a definite failure", async () => {
    const { w, provider, params, executor } = setup();
    provider.script(new Error("socket hang up"));
    expect((await executor.execute(params)).kind).toBe("awaitUserDecision");
    expect((await stored(w))?.state).toBe("unknown");
    expect(w.usage.all(owner)[0]).toMatchObject({ outcome: "unknown", errorCode: "providerError" });
  });

  it("an abort becomes unknown with code timeout, even if the provider never settles", async () => {
    const w = createProviderWorld();
    const provider = new FakeProvider("deepseek", "none");
    provider.script("hang");
    const executor = w.executor({ timeoutSignal: abortedSignal });
    const result = await executor.execute({
      ownerId: owner,
      sourceEventId,
      stage: "interpret",
      provider,
      estimateMicroUsd: ESTIMATE,
      invoke: provider.invoke,
    });
    expect(result.kind).toBe("awaitUserDecision");
    expect((await stored(w))?.state).toBe("unknown");
    expect(w.usage.all(owner)[0]).toMatchObject({ outcome: "unknown", errorCode: "timeout" });
  });

  it("asks for the configured call timeout", async () => {
    const asked: number[] = [];
    const w = createProviderWorld();
    const provider = new FakeProvider("deepseek", "none");
    await w
      .executor({
        timeoutSignal: (ms) => {
          asked.push(ms);
          return liveSignal();
        },
      })
      .execute({
        ownerId: owner,
        sourceEventId,
        stage: "interpret",
        provider,
        estimateMicroUsd: 0,
        invoke: provider.invoke,
      });
    expect(asked).toEqual([PIPELINE_TIMEOUTS.callTimeoutMs]);
  });

  it("a worker that died mid-call is treated as unknown for a none provider", async () => {
    const { w, provider, params, executor } = setup();
    const r = await w.calls.getOrCreate(
      owner,
      { sourceEventId, stage: "interpret", providerId: "deepseek" },
      "none",
    );
    await w.calls.beginAttempt(owner, r.id, {}, w.clock.nowMs());
    expect((await executor.execute(params)).kind).toBe("awaitUserDecision");
    expect(provider.calls).toBe(0);
    expect((await stored(w))?.state).toBe("unknown");
  });

  it("a worker that died mid-call is retried for an idempotentKey provider", async () => {
    const provider = new FakeProvider("deepseek", "idempotentKey");
    const { w, params, executor } = setup(provider);
    const r = await w.calls.getOrCreate(
      owner,
      { sourceEventId, stage: "interpret", providerId: "deepseek" },
      "idempotentKey",
    );
    await w.calls.beginAttempt(owner, r.id, {}, w.clock.nowMs());
    expect(await executor.execute(params)).toMatchObject({ kind: "result", value: "ok" });
    expect(provider.calls).toBe(1);
  });

  it("a user-approved retry calls again, marks retriedAfterUnknown and consumes the approval", async () => {
    const { w, provider, params, executor } = setup();
    provider.script({ kind: "unknown", code: "timeout" }, { kind: "success", value: "second" });
    expect((await executor.execute(params)).kind).toBe("awaitUserDecision");
    const record = await stored(w);
    await w.calls.approveRetry(owner, record?.id ?? "", w.clock.nowMs());
    // A new executor instance: the approval must live in the store, not in memory.
    const result = await w.executor().execute(params);
    expect(result).toMatchObject({ kind: "result", value: "second", retriedAfterUnknown: true });
    expect(provider.calls).toBe(2);
    expect((await stored(w))?.userApprovedRetry).toBe(false);
    expect(w.usage.all(owner).map((u) => u.userApprovedRetry)).toEqual([false, true]);
    // The stored result is reused afterwards and keeps its retry mark.
    expect(await w.executor().execute(params)).toMatchObject({
      kind: "result",
      retriedAfterUnknown: true,
    });
    expect(provider.calls).toBe(2);
  });

  it("a second unknown outcome after an approved retry needs a new approval", async () => {
    const { w, provider, params, executor } = setup();
    provider.script({ kind: "unknown", code: "timeout" }, { kind: "unknown", code: "timeout" });
    await executor.execute(params);
    await w.calls.approveRetry(owner, (await stored(w))?.id ?? "", w.clock.nowMs());
    expect((await w.executor().execute(params)).kind).toBe("awaitUserDecision");
    expect((await w.executor().execute(params)).kind).toBe("awaitUserDecision");
    expect(provider.calls).toBe(2);
  });

  it("an approval is honored even when the attempt count is already past the limit", async () => {
    const { w, provider, params, executor } = setup();
    const id = "evt-1:interpret:deepseek";
    await w.calls.getOrCreate(
      owner,
      { sourceEventId, stage: "interpret", providerId: "deepseek" },
      "none",
    );
    for (let i = 0; i < PIPELINE_TIMEOUTS.maxAttempts + 2; i++) {
      await w.calls.beginAttempt(owner, id, {}, w.clock.nowMs());
      await w.calls.markUnknown(owner, id, i + 1, "timeout", w.clock.nowMs());
    }
    expect((await executor.execute(params)).kind).toBe("awaitUserDecision");
    await w.calls.approveRetry(owner, id, w.clock.nowMs());
    expect(await w.executor().execute(params)).toMatchObject({ kind: "result" });
    expect(provider.calls).toBe(1);
  });

  it("definite failures return retryLater up to maxAttempts, then exhausted", async () => {
    const { provider, params, executor } = setup();
    provider.script(
      { kind: "definiteFailure", code: "rateLimited" },
      { kind: "definiteFailure", code: "rateLimited" },
      { kind: "definiteFailure", code: "rateLimited" },
    );
    expect((await executor.execute(params)).kind).toBe("retryLater");
    expect((await executor.execute(params)).kind).toBe("retryLater");
    expect((await executor.execute(params)).kind).toBe("exhausted");
    expect((await executor.execute(params)).kind).toBe("exhausted");
    expect(provider.calls).toBe(PIPELINE_TIMEOUTS.maxAttempts);
  });

  it("does not call the provider when quota is exhausted, and counts no attempt", async () => {
    const { w, provider, params } = setup();
    const executor = w.executor({
      limits: { ...DEFAULT_QUOTA_LIMITS, perRequestMicroUsd: ESTIMATE - 1 },
    });
    expect(await executor.execute(params)).toEqual({
      kind: "quotaExhausted",
      window: "perRequest",
    });
    expect(provider.calls).toBe(0);
    expect((await stored(w))?.attemptCount).toBe(0);
    expect(w.usage.all(owner)).toHaveLength(0);
  });

  it("charges quota for each attempt, including unknown ones", async () => {
    const { w, provider, params, executor } = setup();
    provider.script({ kind: "unknown", code: "timeout" }, { kind: "success", value: "ok" });
    await executor.execute(params);
    await w.calls.approveRetry(owner, (await stored(w))?.id ?? "", w.clock.nowMs());
    await w.executor().execute(params);
    expect(w.quota.monthlyReserved(owner)).toBe(2 * ESTIMATE);
  });

  it("settles to the provider-reported cost, and keeps the estimate otherwise", async () => {
    const { w, provider, params, executor } = setup();
    provider.script({ kind: "success", value: "ok", actualMicroUsd: 4_000 });
    await executor.execute(params);
    expect(w.quota.monthlyReserved(owner)).toBe(4_000);
    expect(w.usage.all(owner)[0]).toMatchObject({
      estimatedMicroUsd: ESTIMATE,
      actualMicroUsd: 4_000,
    });
  });

  it("skips quota entirely for a free provider", async () => {
    const provider = new FakeProvider("tesseract", "localPure");
    const { w, params, executor } = setup(provider);
    await executor.execute({ ...params, estimateMicroUsd: 0 });
    expect(w.quota.monthlyReserved(owner)).toBe(0);
    expect(w.usage.all(owner)).toHaveLength(1);
  });

  it("logs quotaWarning with the window when a reservation crosses 80%", async () => {
    const { w, params } = setup();
    const executor = w.executor({
      limits: { perRequestMicroUsd: 50_000, dailyMicroUsd: ESTIMATE, monthlyMicroUsd: 1_000_000 },
    });
    await executor.execute(params);
    expect(w.logger.events.filter((e) => e.event === "quotaWarning")).toEqual([
      { level: "warn", event: "quotaWarning", fields: { window: "daily", sourceEventId: "evt-1" } },
    ]);
  });

  it("a fallback provider gets its own record and does not reuse another provider result", async () => {
    const primary = new FakeProvider("deepseek", "none");
    const fallback = new FakeProvider("backup", "none");
    fallback.script({ kind: "success", value: "from-backup" });
    const { w, params, executor } = setup(primary);
    await executor.execute(params);
    const second = await executor.execute({
      ...params,
      provider: fallback,
      invoke: fallback.invoke,
    });
    expect(second).toMatchObject({ kind: "result", value: "from-backup" });
    expect(fallback.calls).toBe(1);
    expect(await w.calls.listForStage(owner, sourceEventId, "interpret")).toHaveLength(2);
  });

  it("a purged record is resultMissing and makes no call", async () => {
    const { w, provider, params, executor } = setup();
    await executor.execute(params);
    w.calls.seed(owner, "evt-1:interpret:deepseek", { state: "purged" });
    expect((await executor.execute(params)).kind).toBe("resultMissing");
    expect(provider.calls).toBe(1);
  });

  it("a succeeded record with no result is resultMissing and makes no call", async () => {
    const { w, provider, params, executor } = setup();
    await executor.execute(params);
    w.calls.seed(owner, "evt-1:interpret:deepseek", { state: "succeeded" });
    expect((await stored(w))?.result).toBeUndefined();
    expect((await executor.execute(params)).kind).toBe("resultMissing");
    expect(provider.calls).toBe(1);
  });

  it("a result that cannot be stored throws, leaves the outcome unknown and is never silently repeated", async () => {
    const { w, provider, params, executor } = setup();
    provider.script({ kind: "success", value: Number.NaN });
    await expect(executor.execute(params)).rejects.toMatchObject({ code: "invalidIntent" });
    expect((await stored(w))?.state).toBe("unknown");
    expect(w.usage.all(owner)[0]).toMatchObject({
      outcome: "unknown",
      errorCode: "resultNotStorable",
    });
    expect((await executor.execute(params)).kind).toBe("awaitUserDecision");
    expect(provider.calls).toBe(1);
  });

  it("a failing usage append does not lose a stored result", async () => {
    const { w, params, executor } = setup();
    w.usage.failNextAppend();
    expect(await executor.execute(params)).toMatchObject({ kind: "result", value: "ok" });
    expect(w.logger.events.some((e) => e.event === "aiUsage.appendFailed")).toBe(true);
  });

  it("a live abort during the call becomes unknown with code timeout", async () => {
    const w = createProviderWorld();
    const ctl = controllableSignal();
    const provider = new FakeProvider("deepseek", "none");
    provider.script("hang");
    provider.onInvoke = () => {
      ctl.abort();
      return Promise.resolve();
    };
    const result = await w.executor({ timeoutSignal: () => ctl.signal }).execute({
      ownerId: owner,
      sourceEventId,
      stage: "interpret",
      provider,
      estimateMicroUsd: ESTIMATE,
      invoke: provider.invoke,
    });
    expect(result.kind).toBe("awaitUserDecision");
    expect(w.usage.all(owner)[0]).toMatchObject({ outcome: "unknown", errorCode: "timeout" });
  });

  it("an approval survives a quotaExhausted result and is used once quota returns", async () => {
    const { w, provider, params } = setup();
    provider.script({ kind: "unknown", code: "timeout" });
    await w.executor().execute(params);
    await w.calls.approveRetry(owner, "evt-1:interpret:deepseek", w.clock.nowMs());
    const blocked = w.executor({ limits: { ...DEFAULT_QUOTA_LIMITS, perRequestMicroUsd: 1 } });
    expect((await blocked.execute(params)).kind).toBe("quotaExhausted");
    expect((await stored(w))?.userApprovedRetry).toBe(true);
    expect(await w.executor().execute(params)).toMatchObject({
      kind: "result",
      retriedAfterUnknown: true,
    });
  });

  it("a late failure from attempt 1 does not disturb attempt 2, which stores its result", async () => {
    const provider = new FakeProvider("deepseek", "idempotentKey");
    const { w, params, executor } = setup(provider);
    provider.script({ kind: "unknown", code: "timeout" }, { kind: "success", value: "B" });
    expect((await executor.execute(params)).kind).toBe("retryLater");
    provider.onInvoke = async () => {
      await w.calls.markFailed(owner, "evt-1:interpret:deepseek", 1, "late", w.clock.nowMs());
    };
    expect(await executor.execute(params)).toMatchObject({ kind: "result", value: "B" });
    expect(await stored(w)).toMatchObject({ state: "succeeded", result: "B" });
    expect(await executor.execute(params)).toMatchObject({ kind: "result", value: "B" });
    expect(provider.calls).toBe(2);
  });

  it("a late success from attempt 1 wins, and execute returns what is stored", async () => {
    const provider = new FakeProvider("deepseek", "idempotentKey");
    const { w, params, executor } = setup(provider);
    provider.script({ kind: "unknown", code: "timeout" }, { kind: "success", value: "B" });
    await executor.execute(params);
    provider.onInvoke = async () => {
      await w.calls.markSucceeded(owner, "evt-1:interpret:deepseek", 1, "A", w.clock.nowMs());
    };
    expect(await executor.execute(params)).toMatchObject({ kind: "result", value: "A" });
    expect(await stored(w)).toMatchObject({ result: "A" });
  });

  it.each(["success", "definiteFailure", "unknown"] as const)(
    "a %s outcome whose record write fails still meters the attempt",
    async (kind) => {
      const { w, provider, params, executor } = setup();
      provider.script(kind === "success" ? { kind, value: "ok" } : { kind, code: "x" });
      const down = () => Promise.reject(new Error("db down"));
      if (kind === "success") w.calls.markSucceeded = down;
      else if (kind === "definiteFailure") w.calls.markFailed = down;
      else w.calls.markUnknown = down;
      await expect(executor.execute(params)).rejects.toThrow("db down");
      expect(w.usage.all(owner)).toHaveLength(1);
      expect(w.usage.all(owner)[0]).toMatchObject({
        id: "evt-1:interpret:deepseek:1",
        outcome: "unknown",
        errorCode: "recordWriteFailed",
      });
    },
  );

  it("a worker that died mid-call is metered unknown, with the reserved estimate", async () => {
    const { w, params, executor } = setup();
    const r = await w.calls.getOrCreate(
      owner,
      { sourceEventId, stage: "interpret", providerId: "deepseek" },
      "none",
    );
    await w.calls.beginAttempt(owner, r.id, { reservationId: makeReservationId(7_000, 1, "x") }, 1);
    await executor.execute(params);
    expect(w.usage.all(owner)).toEqual([
      expect.objectContaining({
        id: "evt-1:interpret:deepseek:1",
        outcome: "unknown",
        errorCode: "workerDied",
        estimatedMicroUsd: 7_000,
      }),
    ]);
  });

  it("a died worker with no reservation is metered with a zero estimate", async () => {
    const { w, params, executor } = setup();
    const r = await w.calls.getOrCreate(
      owner,
      { sourceEventId, stage: "interpret", providerId: "deepseek" },
      "none",
    );
    await w.calls.beginAttempt(owner, r.id, {}, 1);
    await executor.execute(params);
    expect(w.usage.all(owner)[0]).toMatchObject({ estimatedMicroUsd: 0 });
  });

  it("never lets a numeric error code, such as a phone number, reach aiUsage", async () => {
    const { w, provider, params, executor } = setup();
    provider.script({ kind: "unknown", code: "8801712345678" });
    await executor.execute(params);
    expect(w.usage.all(owner)[0]).toMatchObject({ errorCode: "invalidCode" });
  });

  it("charges a free provider's reported cost to quota", async () => {
    const provider = new FakeProvider("managed-ocr", "localPure");
    const { w, params, executor } = setup(provider);
    provider.script({ kind: "success", value: "ok", actualMicroUsd: 700 });
    await executor.execute({ ...params, estimateMicroUsd: 0 });
    expect(w.quota.monthlyReserved(owner)).toBe(700);
  });

  it("warns when settling upward takes a window past 80%, and stays silent on a downward settle", async () => {
    const limits = {
      perRequestMicroUsd: 50_000,
      dailyMicroUsd: 100_000,
      monthlyMicroUsd: 5_000_000,
    };
    const up = setup();
    up.provider.script({ kind: "success", value: "ok", actualMicroUsd: 85_000 });
    await up.w.executor({ limits }).execute({ ...up.params, estimateMicroUsd: 10_000 });
    expect(up.w.logger.events.filter((e) => e.event === "quotaWarning")).toHaveLength(1);

    const down = setup();
    down.provider.script({ kind: "success", value: "ok", actualMicroUsd: 10 });
    await down.w.executor({ limits }).execute({ ...down.params, estimateMicroUsd: 50_000 });
    expect(down.w.logger.events.filter((e) => e.event === "quotaWarning")).toHaveLength(0);
  });
});
