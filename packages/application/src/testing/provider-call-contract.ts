import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_COLLECTIONS, type OwnerCollectionName } from "@moneytrace/contracts";
import { DomainError, asOwnerId, asSourceEventId } from "@moneytrace/domain";
import type { AIUsageRecord, AIUsageRecorder } from "../ports/ai-usage-recorder";
import type { ProviderCallKey, ProviderCallRepository } from "../ports/provider-call-repository";
import { DEFAULT_QUOTA_LIMITS, type QuotaLedger, type QuotaLimits } from "../ports/quota-ledger";
import type { SourceEventRepository } from "../ports/source-event-repository";

const alice = asOwnerId("alice");
const bob = asOwnerId("bob");
const evt = asSourceEventId("evt-1");
const T0 = 1_700_000_000_000;
const DAY = 86_400_000;

export type ProviderCallHarness = {
  calls: ProviderCallRepository;
  sourceEvents: SourceEventRepository;
  /** The clock the adapters stamp with. */
  nowMs: () => number;
  /** The raw stored documents of one owner collection. */
  docsOf: (ownerId: string, collection: OwnerCollectionName) => Promise<Record<string, unknown>[]>;
};

const key = (providerId = "deepseek", sourceEventId = evt): ProviderCallKey => ({
  sourceEventId,
  stage: "interpret",
  providerId,
});

/** Shared behavior every ProviderCallRepository must satisfy. */
export function describeProviderCallContract(
  name: string,
  makeHarness: () => Promise<ProviderCallHarness>,
): void {
  describe(`${name} provider call contract`, () => {
    let h: ProviderCallHarness;
    let calls: ProviderCallRepository;

    beforeEach(async () => {
      h = await makeHarness();
      calls = h.calls;
      await h.sourceEvents.create(alice, {
        sourceEventId: evt,
        sourceType: "sms",
        sourceHash: "hash-1",
        idempotencyKey: "key-1",
        receivedAtMs: T0,
      });
    });

    const terminate = async (): Promise<void> => {
      const c = await h.sourceEvents.claim(alice, evt, "normalize", "w", h.nowMs());
      if (c.status !== "claimed") throw new Error("claim failed");
      await h.sourceEvents.commitStage(alice, c.claim, { nextStatus: "rejected", outputs: [] });
    };

    it("derives a deterministic ID and requestKey, and creates one record", async () => {
      const a = await calls.getOrCreate(alice, key(), "none");
      const b = await calls.getOrCreate(alice, key(), "none");
      expect(b).toEqual(a);
      expect(a.id).toBe("evt-1:interpret:deepseek");
      expect(a.requestKey).toBe(a.id);
      expect(a.attemptCount).toBe(0);
      expect(a.userApprovedRetry).toBe(false);
      expect(a.retriedAfterUnknown).toBe(false);
      expect(await h.docsOf("alice", "providerCalls")).toHaveLength(1);
    });

    it("gives a fallback provider its own record, and each owner their own", async () => {
      const a = await calls.getOrCreate(alice, key("deepseek"), "none");
      const b = await calls.getOrCreate(alice, key("tesseract"), "localPure");
      expect(b.id).not.toBe(a.id);
      await calls.beginAttempt(alice, a.id, {}, T0);
      const other = await calls.getOrCreate(bob, key("deepseek"), "none");
      expect(other.attemptCount).toBe(0);
    });

    it("rejects a key that would make the ID ambiguous, and a safety mismatch", async () => {
      await expect(calls.getOrCreate(alice, key("a:b"), "none")).rejects.toMatchObject({
        code: "invalidIntent",
      });
      await calls.getOrCreate(alice, key(), "none");
      await expect(calls.getOrCreate(alice, key(), "localPure")).rejects.toBeInstanceOf(
        DomainError,
      );
    });

    it("beginAttempt counts the attempt and marks the call started", async () => {
      const r = await calls.getOrCreate(alice, key(), "none");
      const s = await calls.beginAttempt(alice, r.id, { reservationId: "res_1_2_x" }, T0 + 5);
      expect(s).toMatchObject({
        state: "started",
        attemptCount: 1,
        quotaReservationId: "res_1_2_x",
        updatedAtMs: T0 + 5,
      });
      // An attempt in flight cannot be started again.
      await expect(calls.beginAttempt(alice, r.id, {}, T0)).rejects.toMatchObject({
        code: "invalidIntent",
      });
      await calls.markFailed(alice, r.id, 1, "rejected", T0);
      expect((await calls.beginAttempt(alice, r.id, {}, T0)).attemptCount).toBe(2);
    });

    it("keeps an approval until the next attempt consumes it", async () => {
      const r = await calls.getOrCreate(alice, key(), "none");
      await calls.beginAttempt(alice, r.id, {}, T0);
      await calls.markUnknown(alice, r.id, 1, "timeout", T0);
      expect(await calls.approveRetry(alice, r.id, T0)).toBe("approved");
      expect((await calls.listForStage(alice, evt, "interpret"))[0]?.userApprovedRetry).toBe(true);
      const next = await calls.beginAttempt(alice, r.id, {}, T0);
      expect(next).toMatchObject({
        userApprovedRetry: false,
        retriedAfterUnknown: true,
        attemptCount: 2,
      });
    });

    it("does not record an approval where none is needed", async () => {
      const r = await calls.getOrCreate(alice, key(), "none");
      expect(await calls.approveRetry(alice, r.id, T0)).toBe("notApplicable");
      await calls.beginAttempt(alice, r.id, {}, T0);
      await calls.markFailed(alice, r.id, 1, "rejected", T0);
      expect(await calls.approveRetry(alice, r.id, T0)).toBe("notApplicable");
      await calls.beginAttempt(alice, r.id, {}, T0);
      await calls.markSucceeded(alice, r.id, 2, "ok", T0);
      expect(await calls.approveRetry(alice, r.id, T0)).toBe("notApplicable");
    });

    it("stores a result once and never overwrites it", async () => {
      const r = await calls.getOrCreate(alice, key(), "none");
      await calls.beginAttempt(alice, r.id, {}, T0);
      const first = await calls.markSucceeded(alice, r.id, 1, { amount: 5, tags: ["a"] }, T0);
      expect(first).toMatchObject({ state: "succeeded", result: { amount: 5, tags: ["a"] } });
      const second = await calls.markSucceeded(alice, r.id, 1, "other", T0 + 1);
      expect(second.result).toEqual({ amount: 5, tags: ["a"] });
    });

    it("accepts a late success after the call was recorded unknown", async () => {
      const r = await calls.getOrCreate(alice, key(), "none");
      await calls.beginAttempt(alice, r.id, {}, T0);
      await calls.markUnknown(alice, r.id, 1, "workerDied", T0);
      const late = await calls.markSucceeded(alice, r.id, 1, "late", T0 + 1);
      expect(late).toMatchObject({ state: "succeeded", result: "late" });
    });

    it("a late failure does not overwrite an unknown outcome", async () => {
      const r = await calls.getOrCreate(alice, key(), "none");
      await calls.beginAttempt(alice, r.id, {}, T0);
      await calls.markUnknown(alice, r.id, 1, "workerDied", T0);
      expect((await calls.markFailed(alice, r.id, 1, "rejected", T0)).state).toBe("unknown");
    });

    it.each([
      ["undefined", undefined],
      ["NaN", Number.NaN],
      ["Infinity", Number.POSITIVE_INFINITY],
      ["a function", () => 1],
      ["a bigint", 10n],
      ["a Date", new Date(0)],
      ["a nested array", [[1]]],
      ["an undefined field", { a: undefined }],
      ["a reserved key", { __x__: 1 }],
      ["a result over 512 KiB in UTF-8 bytes", "\u0985".repeat(200_000)],
    ])("rejects %s as a result and leaves the call started", async (_n, bad) => {
      const r = await calls.getOrCreate(alice, key(), "none");
      await calls.beginAttempt(alice, r.id, {}, T0);
      await expect(calls.markSucceeded(alice, r.id, 1, bad, T0)).rejects.toMatchObject({
        code: "invalidIntent",
      });
      expect((await calls.listForStage(alice, evt, "interpret"))[0]).toMatchObject({
        state: "started",
      });
    });

    it("rejects a cyclic result", async () => {
      const r = await calls.getOrCreate(alice, key(), "none");
      await calls.beginAttempt(alice, r.id, {}, T0);
      const cyclic: Record<string, unknown> = {};
      cyclic["self"] = cyclic;
      await expect(calls.markSucceeded(alice, r.id, 1, cyclic, T0)).rejects.toMatchObject({
        code: "invalidIntent",
      });
    });

    it("ignores a failure or unknown outcome reported by an older attempt", async () => {
      const r = await calls.getOrCreate(alice, key(), "none");
      await calls.beginAttempt(alice, r.id, {}, T0);
      await calls.markFailed(alice, r.id, 1, "rejected", T0);
      await calls.beginAttempt(alice, r.id, {}, T0);
      expect((await calls.markFailed(alice, r.id, 1, "late", T0)).state).toBe("started");
      expect((await calls.markUnknown(alice, r.id, 1, "late", T0)).state).toBe("started");
      expect((await calls.markFailed(alice, r.id, 2, "real", T0)).state).toBe("failed");
    });

    it("first success wins: a late success is kept and the newer attempt's does not replace it", async () => {
      const r = await calls.getOrCreate(alice, key(), "none");
      await calls.beginAttempt(alice, r.id, {}, T0);
      await calls.markFailed(alice, r.id, 1, "rejected", T0);
      await calls.beginAttempt(alice, r.id, {}, T0);
      const late = await calls.markSucceeded(alice, r.id, 1, "A", T0);
      expect(late).toMatchObject({ state: "succeeded", result: "A" });
      expect((await calls.markSucceeded(alice, r.id, 2, "B", T0)).result).toBe("A");
    });

    it("rejects a success from an attempt that was never started", async () => {
      const r = await calls.getOrCreate(alice, key(), "none");
      await calls.beginAttempt(alice, r.id, {}, T0);
      await expect(calls.markSucceeded(alice, r.id, 2, "x", T0)).rejects.toMatchObject({
        code: "invalidIntent",
      });
    });

    it("a stored success clears a pending approval", async () => {
      const r = await calls.getOrCreate(alice, key(), "none");
      await calls.beginAttempt(alice, r.id, {}, T0);
      await calls.approveRetry(alice, r.id, T0);
      const done = await calls.markSucceeded(alice, r.id, 1, "ok", T0);
      expect(done.userApprovedRetry).toBe(false);
    });

    it("records whether the last attempt was approved", async () => {
      const r = await calls.getOrCreate(alice, key(), "none");
      expect(r.lastAttemptApproved).toBe(false);
      await calls.beginAttempt(alice, r.id, {}, T0);
      await calls.markUnknown(alice, r.id, 1, "timeout", T0);
      await calls.approveRetry(alice, r.id, T0);
      expect((await calls.beginAttempt(alice, r.id, {}, T0)).lastAttemptApproved).toBe(true);
      await calls.markFailed(alice, r.id, 2, "rejected", T0);
      expect((await calls.beginAttempt(alice, r.id, {}, T0)).lastAttemptApproved).toBe(false);
    });

    it("lists the calls of one stage only", async () => {
      await calls.getOrCreate(alice, key("a"), "none");
      await calls.getOrCreate(alice, { ...key("b"), stage: "normalize" }, "none");
      expect((await calls.listForStage(alice, evt, "interpret")).map((c) => c.providerId)).toEqual([
        "a",
      ]);
      expect(await calls.listForStage(bob, evt, "interpret")).toEqual([]);
    });

    it("refuses to purge a result while the event is not terminal", async () => {
      const r = await calls.getOrCreate(alice, key(), "none");
      await calls.beginAttempt(alice, r.id, {}, T0);
      await calls.markSucceeded(alice, r.id, 1, "ok", T0);
      expect(await calls.purgeResult(alice, r.id, T0)).toBe("blockedNotTerminal");
      expect((await calls.listForStage(alice, evt, "interpret"))[0]).toMatchObject({
        state: "succeeded",
        result: "ok",
      });
    });

    it("purges a terminal event's results; completing the purge flags the event", async () => {
      const a = await calls.getOrCreate(alice, key("a"), "none");
      const b = await calls.getOrCreate(alice, key("b"), "none");
      for (const c of [a, b]) {
        await calls.beginAttempt(alice, c.id, {}, T0);
        await calls.markSucceeded(alice, c.id, 1, "ok", T0);
      }
      await terminate();
      expect(await calls.purgeResult(alice, a.id, T0)).toBe("purged");
      expect(await calls.completeEventPurge(alice, evt)).toBe("resultsRemain");
      expect((await h.sourceEvents.get(alice, evt))?.providerResultsPurged).toBe(false);
      expect(await calls.purgeResult(alice, b.id, T0)).toBe("purged");
      expect(await calls.purgeResult(alice, b.id, T0)).toBe("purged");
      expect(await calls.completeEventPurge(alice, evt)).toBe("done");
      const stored = await calls.listForStage(alice, evt, "interpret");
      for (const c of stored) {
        expect(c.state).toBe("purged");
        expect(c.result).toBeUndefined();
      }
      expect((await h.sourceEvents.get(alice, evt))?.providerResultsPurged).toBe(true);
    });

    it("lists terminal events past the cutoff that still hold results", async () => {
      expect(await calls.listPurgeCandidates(T0 + 10 * DAY, 10)).toEqual([]);
      await terminate();
      const at = h.nowMs();
      expect(await calls.listPurgeCandidates(at - 1, 10)).toEqual([]);
      expect(await calls.listPurgeCandidates(at, 10)).toEqual([
        { ownerId: alice, sourceEventId: evt },
      ]);
      expect(await calls.completeEventPurge(alice, evt)).toBe("done");
      expect(await calls.listPurgeCandidates(at, 10)).toEqual([]);
    });

    it("will not complete an event purge while a result remains or the event is live", async () => {
      const r = await calls.getOrCreate(alice, key(), "none");
      await calls.beginAttempt(alice, r.id, {}, T0);
      await calls.markSucceeded(alice, r.id, 1, "ok", T0);
      expect(await calls.completeEventPurge(alice, evt)).toBe("blockedNotTerminal");
      await terminate();
      expect(await calls.completeEventPurge(alice, evt)).toBe("resultsRemain");
    });

    it("every stored provider call validates against its contract schema", async () => {
      const a = await calls.getOrCreate(alice, key("a"), "idempotentKey");
      await calls.beginAttempt(alice, a.id, { reservationId: "res_1_2_x" }, T0);
      await calls.markSucceeded(alice, a.id, 1, { v: 1 }, T0);
      const b = await calls.getOrCreate(alice, key("b"), "none");
      await calls.beginAttempt(alice, b.id, {}, T0);
      await calls.markUnknown(alice, b.id, 1, "timeout", T0);
      await terminate();
      await calls.purgeResult(alice, a.id, T0);
      const docs = await h.docsOf("alice", "providerCalls");
      expect(docs).toHaveLength(2);
      for (const d of docs) expect(() => OWNER_COLLECTIONS.providerCalls.parse(d)).not.toThrow();
    });
  });
}

export type QuotaHarness = {
  quota: QuotaLedger;
  /** Moves the clock the quota ledger stamps and windows with. */
  setNowMs: (ms: number) => void;
  docsOf: (ownerId: string, collection: OwnerCollectionName) => Promise<Record<string, unknown>[]>;
};

const LIMITS: QuotaLimits = DEFAULT_QUOTA_LIMITS;
/** 2023-11-14T22:13:20Z: a UTC day that is not about to roll over. */
const NOON = T0;

/** Shared behavior every QuotaLedger must satisfy. */
export function describeQuotaContract(
  name: string,
  makeHarness: () => Promise<QuotaHarness>,
): void {
  describe(`${name} quota contract`, () => {
    let h: QuotaHarness;
    let quota: QuotaLedger;

    beforeEach(async () => {
      h = await makeHarness();
      h.setNowMs(NOON);
      quota = h.quota;
    });

    const reserve = (microUsd: number, owner = alice, nowMs = NOON) =>
      quota.reserve(owner, microUsd, nowMs, LIMITS);

    it("available is the tighter window, never below zero", async () => {
      const limits = { perRequestMicroUsd: 100, dailyMicroUsd: 100, monthlyMicroUsd: 1000 };
      const at = Date.parse("2026-03-10T00:00:00Z");
      expect(await quota.availableMicroUsd(asOwnerId("q-avail"), at, limits)).toBe(100);
      await quota.reserve(asOwnerId("q-avail"), 60, at, limits);
      expect(await quota.availableMicroUsd(asOwnerId("q-avail"), at, limits)).toBe(40);
      expect(
        await quota.availableMicroUsd(asOwnerId("q-avail"), at, { ...limits, dailyMicroUsd: 10 }),
      ).toBe(0);
      expect(await quota.availableMicroUsd(asOwnerId("q-avail"), at + 86_400_000, limits)).toBe(
        100,
      );
    });

    it("reserves and returns a reservation ID that is a valid document ID", async () => {
      const r = await reserve(1000);
      expect(r).toMatchObject({ status: "reserved", warningsCrossed: [] });
      if (r.status === "reserved") expect(r.reservationId).toMatch(/^[A-Za-z0-9_:.-]{1,128}$/);
    });

    it("rejects an estimate above the per-request limit without touching counters", async () => {
      expect(await reserve(LIMITS.perRequestMicroUsd + 1)).toEqual({
        status: "exhausted",
        window: "perRequest",
      });
      expect(await h.docsOf("alice", "quotaCounters")).toHaveLength(0);
    });

    it("rejects invalid amounts", async () => {
      for (const bad of [-1, 1.5, Number.NaN, 2 ** 53]) {
        await expect(reserve(bad)).rejects.toMatchObject({ code: "invalidIntent" });
      }
    });

    it("rejects at the daily boundary: reserved + estimate > limit", async () => {
      const per = LIMITS.perRequestMicroUsd;
      for (let i = 0; i < 10; i++) expect((await reserve(per)).status).toBe("reserved");
      // 500_000 reserved: exactly at the limit. One more micro-dollar must not fit.
      expect(await reserve(1)).toEqual({ status: "exhausted", window: "daily" });
      expect(await reserve(0)).toMatchObject({ status: "reserved" });
    });

    it("accepts a reservation that lands exactly on the daily limit", async () => {
      const limits: QuotaLimits = { ...LIMITS, dailyMicroUsd: 100, perRequestMicroUsd: 100 };
      expect((await quota.reserve(alice, 60, NOON, limits)).status).toBe("reserved");
      expect((await quota.reserve(alice, 40, NOON, limits)).status).toBe("reserved");
      expect(await quota.reserve(alice, 1, NOON, limits)).toEqual({
        status: "exhausted",
        window: "daily",
      });
    });

    it("rejects at the monthly boundary across days, and the daily window resets", async () => {
      const limits: QuotaLimits = {
        perRequestMicroUsd: 100,
        dailyMicroUsd: 100,
        monthlyMicroUsd: 150,
      };
      expect((await quota.reserve(alice, 100, NOON, limits)).status).toBe("reserved");
      const nextDay = NOON + DAY;
      expect((await quota.reserve(alice, 50, nextDay, limits)).status).toBe("reserved");
      // The new day has daily room left, but the month is full.
      expect(await quota.reserve(alice, 1, nextDay, limits)).toEqual({
        status: "exhausted",
        window: "monthly",
      });
    });

    it("a new UTC day resets the daily window but not the monthly one", async () => {
      const limits: QuotaLimits = {
        perRequestMicroUsd: 100,
        dailyMicroUsd: 100,
        monthlyMicroUsd: 1000,
      };
      expect((await quota.reserve(alice, 100, NOON, limits)).status).toBe("reserved");
      expect((await quota.reserve(alice, 1, NOON, limits)).status).toBe("exhausted");
      expect((await quota.reserve(alice, 100, NOON + DAY, limits)).status).toBe("reserved");
      const monthly = (await h.docsOf("alice", "quotaCounters")).find(
        (d) => d["window"] === "2023-11",
      );
      expect(monthly?.["reservedMicroUsd"]).toBe(200);
    });

    it("a new UTC month resets the monthly window", async () => {
      const limits: QuotaLimits = {
        perRequestMicroUsd: 100,
        dailyMicroUsd: 100,
        monthlyMicroUsd: 100,
      };
      expect((await quota.reserve(alice, 100, NOON, limits)).status).toBe("reserved");
      expect((await quota.reserve(alice, 1, NOON + DAY, limits)).status).toBe("exhausted");
      expect((await quota.reserve(alice, 100, NOON + 20 * DAY, limits)).status).toBe("reserved");
    });

    it("warns once, on the first reservation that takes a window to 80%", async () => {
      const limits: QuotaLimits = {
        perRequestMicroUsd: 100,
        dailyMicroUsd: 100,
        monthlyMicroUsd: 1000,
      };
      expect(await quota.reserve(alice, 79, NOON, limits)).toMatchObject({ warningsCrossed: [] });
      expect(await quota.reserve(alice, 1, NOON, limits)).toMatchObject({
        warningsCrossed: ["daily"],
      });
      expect(await quota.reserve(alice, 5, NOON, limits)).toMatchObject({ warningsCrossed: [] });
      const daily = (await h.docsOf("alice", "quotaCounters")).find(
        (d) => d["window"] === "2023-11-14",
      );
      expect(daily?.["warnedAtMs"]).toBe(NOON);
    });

    it("reports both windows when one reservation crosses both", async () => {
      const limits: QuotaLimits = {
        perRequestMicroUsd: 80,
        dailyMicroUsd: 100,
        monthlyMicroUsd: 100,
      };
      expect(await quota.reserve(alice, 80, NOON, limits)).toMatchObject({
        warningsCrossed: ["daily", "monthly"],
      });
    });

    it("settle adjusts the reservation down and up, and never below zero", async () => {
      const r = await reserve(1000);
      if (r.status !== "reserved") throw new Error("not reserved");
      const monthly = async (): Promise<unknown> =>
        (await h.docsOf("alice", "quotaCounters")).find((d) => d["window"] === "2023-11")?.[
          "reservedMicroUsd"
        ];
      expect(await monthly()).toBe(1000);
      await quota.settle(alice, r.reservationId, 400, LIMITS);
      expect(await monthly()).toBe(400);
      const r2 = await reserve(100);
      if (r2.status !== "reserved") throw new Error("not reserved");
      await quota.settle(alice, r2.reservationId, 900, LIMITS);
      expect(await monthly()).toBe(1300);
      for (const d of await h.docsOf("alice", "quotaCounters")) {
        expect(() => OWNER_COLLECTIONS.quotaCounters.parse(d)).not.toThrow();
      }
    });

    it("settling upward past 80% warns once; settling downward stays silent", async () => {
      const limits: QuotaLimits = {
        perRequestMicroUsd: 100,
        dailyMicroUsd: 100,
        monthlyMicroUsd: 1000,
      };
      const r = await quota.reserve(alice, 50, NOON, limits);
      if (r.status !== "reserved") throw new Error("not reserved");
      expect(await quota.settle(alice, r.reservationId, 90, limits)).toEqual({
        warningsCrossed: ["daily"],
      });
      const daily = (await h.docsOf("alice", "quotaCounters")).find(
        (d) => d["window"] === "2023-11-14",
      );
      expect(daily?.["warnedAtMs"]).toBe(NOON);
      const r2 = await quota.reserve(alice, 1, NOON, limits);
      expect(r2).toMatchObject({ warningsCrossed: [] });
      if (r2.status !== "reserved") throw new Error("not reserved");
      expect(await quota.settle(alice, r2.reservationId, 5, limits)).toEqual({
        warningsCrossed: [],
      });
    });

    it("a downward settle never warns", async () => {
      const limits: QuotaLimits = {
        perRequestMicroUsd: 100,
        dailyMicroUsd: 100,
        monthlyMicroUsd: 100,
      };
      const r = await quota.reserve(alice, 70, NOON, limits);
      if (r.status !== "reserved") throw new Error("not reserved");
      expect(await quota.settle(alice, r.reservationId, 10, limits)).toEqual({
        warningsCrossed: [],
      });
    });

    it("settle rejects a malformed reservation ID or amount", async () => {
      await expect(quota.settle(alice, "nope", 1, LIMITS)).rejects.toMatchObject({
        code: "invalidIntent",
      });
      const r = await reserve(10);
      if (r.status !== "reserved") throw new Error("not reserved");
      await expect(quota.settle(alice, r.reservationId, -1, LIMITS)).rejects.toMatchObject({
        code: "invalidIntent",
      });
    });

    it("keeps quota per owner", async () => {
      for (let i = 0; i < 10; i++) await reserve(LIMITS.perRequestMicroUsd);
      expect((await reserve(1)).status).toBe("exhausted");
      expect((await reserve(1, bob)).status).toBe("reserved");
    });
  });
}

const rec = (id: string, over: Partial<AIUsageRecord> = {}): AIUsageRecord => ({
  id,
  providerId: "deepseek",
  estimatedMicroUsd: 100,
  outcome: "success",
  userApprovedRetry: false,
  sourceEventId: "evt-1",
  stage: "interpret",
  attempt: 1,
  createdAtMs: T0,
  ...over,
});

export type UsageHarness = {
  usage: AIUsageRecorder;
  docsOf: (ownerId: string, collection: OwnerCollectionName) => Promise<Record<string, unknown>[]>;
};

/** Shared behavior every AIUsageRecorder must satisfy. */
export function describeAiUsageContract(
  name: string,
  makeHarness: () => Promise<UsageHarness>,
): void {
  describe(`${name} ai usage contract`, () => {
    let h: UsageHarness;

    beforeEach(async () => {
      h = await makeHarness();
    });

    it("lists one UTC day, owner-scoped, and the day boundaries are half open", async () => {
      const dayStart = Math.floor(T0 / DAY) * DAY;
      await h.usage.append(alice, rec("a", { createdAtMs: dayStart }));
      await h.usage.append(alice, rec("b", { createdAtMs: dayStart + DAY - 1 }));
      await h.usage.append(alice, rec("c", { createdAtMs: dayStart + DAY }));
      await h.usage.append(alice, rec("d", { createdAtMs: dayStart - 1 }));
      await h.usage.append(bob, rec("e", { createdAtMs: dayStart }));
      const got = await h.usage.listForUtcDay(alice, "2023-11-14");
      expect(got.map((r) => r.id).sort()).toEqual(["a", "b"]);
    });

    it("appending the same ID again keeps one record", async () => {
      await h.usage.append(alice, rec("a"));
      await h.usage.append(alice, rec("a"));
      expect(await h.usage.listForUtcDay(alice, "2023-11-14")).toHaveLength(1);
    });

    it("keeps optional fields and validates every stored document", async () => {
      await h.usage.append(
        alice,
        rec("a", {
          outcome: "unknown",
          errorCode: "timeout",
          actualMicroUsd: 7,
          userApprovedRetry: true,
        }),
      );
      const [only] = await h.usage.listForUtcDay(alice, "2023-11-14");
      expect(only).toMatchObject({
        errorCode: "timeout",
        actualMicroUsd: 7,
        userApprovedRetry: true,
      });
      for (const d of await h.docsOf("alice", "aiUsage")) {
        expect(() => OWNER_COLLECTIONS.aiUsage.parse(d)).not.toThrow();
      }
    });

    it("appendIfAbsent creates a row, never overwrites one, and a real append replaces it", async () => {
      expect(await h.usage.appendIfAbsent(alice, rec("a", { errorCode: "workerDied" }))).toBe(
        "created",
      );
      expect(await h.usage.appendIfAbsent(alice, rec("a", { errorCode: "other" }))).toBe("exists");
      expect((await h.usage.listForUtcDay(alice, "2023-11-14"))[0]?.errorCode).toBe("workerDied");
      await h.usage.append(alice, rec("a", { outcome: "success" }));
      expect(await h.usage.appendIfAbsent(alice, rec("a", { errorCode: "late" }))).toBe("exists");
      const [only] = await h.usage.listForUtcDay(alice, "2023-11-14");
      expect(only).toMatchObject({ outcome: "success" });
      expect(only?.errorCode).toBeUndefined();
      for (const d of await h.docsOf("alice", "aiUsage")) {
        expect(() => OWNER_COLLECTIONS.aiUsage.parse(d)).not.toThrow();
      }
    });

    it("rejects a malformed day and a record that fails the schema", async () => {
      await expect(h.usage.listForUtcDay(alice, "2023-13-40")).rejects.toMatchObject({
        code: "invalidIntent",
      });
      await expect(h.usage.listForUtcDay(alice, "today")).rejects.toMatchObject({
        code: "invalidIntent",
      });
      await expect(h.usage.append(alice, rec("a", { estimatedMicroUsd: 1.5 }))).rejects.toThrow();
    });
  });
}
