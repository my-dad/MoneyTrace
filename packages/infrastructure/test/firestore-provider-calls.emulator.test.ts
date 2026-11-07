import {
  DEFAULT_QUOTA_LIMITS,
  PIPELINE_TIMEOUTS,
  ProviderCallExecutor,
  RecoverExpiredClaims,
  type QuotaLimits,
} from "@moneytrace/application";
import {
  CapturingLogger,
  FakeProvider,
  SequentialIdGenerator,
  describeAiUsageContract,
  describeProviderCallContract,
  describeQuotaContract,
} from "@moneytrace/application/testing";
import { OWNER_COLLECTIONS, type OwnerCollectionName } from "@moneytrace/contracts";
import { asOwnerId, asSourceEventId } from "@moneytrace/domain";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { systemTimeoutSignal } from "../src/system/abort-timeout";
import { FirestoreAiUsageRecorder } from "../src/firestore/firestore-ai-usage-recorder";
import { FirestoreProviderCallRepository } from "../src/firestore/firestore-provider-call-repository";
import { FirestoreQuotaLedger } from "../src/firestore/firestore-quota-ledger";
import { FirestoreSourceEventRepository } from "../src/firestore/firestore-source-event-repository";
import { ownerPath } from "../src/firestore/paths";

const PROJECT_ID = "demo-moneytrace";
const host = process.env["FIRESTORE_EMULATOR_HOST"];
if (host === undefined) throw new Error("run through `firebase emulators:exec`");
const emulatorHost: string = host;

// Skip the GCE metadata probe: it only produces a timeout warning against the emulator.
process.env["METADATA_SERVER_DETECTION"] = "none";

const db: Firestore = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));
/** Contended Firestore transactions retry with a growing backoff, so they are slow by design. */
const CONTENTION_TIMEOUT_MS = 120_000;
const T0 = 1_700_000_001_000;

async function clearFirestore(): Promise<void> {
  const res = await fetch(
    `http://${emulatorHost}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`could not clear the emulator: ${String(res.status)}`);
}

async function docsOf(ownerId: string, collection: OwnerCollectionName) {
  const snap = await db.collection(ownerPath(ownerId, collection)).get();
  return snap.docs.map((d) => d.data());
}

describeProviderCallContract("firestore", async () => {
  await clearFirestore();
  const clock = { nowMs: () => T0 };
  return {
    calls: new FirestoreProviderCallRepository(db, clock),
    sourceEvents: new FirestoreSourceEventRepository(db, clock, new CapturingLogger()),
    nowMs: () => T0,
    docsOf,
  };
});

describeQuotaContract("firestore", async () => {
  await clearFirestore();
  let now = T0;
  const clock = { nowMs: () => now };
  return {
    quota: new FirestoreQuotaLedger(db, clock, new SequentialIdGenerator()),
    setNowMs: (ms) => {
      now = ms;
    },
    docsOf,
  };
});

describeAiUsageContract("firestore", async () => {
  await clearFirestore();
  return { usage: new FirestoreAiUsageRecorder(db), docsOf };
});

const owner = asOwnerId("alice");

describe("firestore quota ledger under contention", () => {
  it(
    "ten parallel reserves that together exceed the daily limit never over-reserve",
    async () => {
      await clearFirestore();
      const quota = new FirestoreQuotaLedger(db, { nowMs: () => T0 }, new SequentialIdGenerator());
      const limits: QuotaLimits = { ...DEFAULT_QUOTA_LIMITS, dailyMicroUsd: 300_000 };
      const settled = await Promise.allSettled(
        Array.from({ length: 10 }, () => quota.reserve(owner, 50_000, T0, limits)),
      );
      const reserved = settled.filter(
        (r) => r.status === "fulfilled" && r.value.status === "reserved",
      ).length;
      // Anything not reserved was either refused for the daily window or surfaced as an error,
      // never reported as exhausted without a decision.
      for (const r of settled) {
        if (r.status === "fulfilled" && r.value.status === "exhausted") {
          expect(r.value.window).toBe("daily");
        }
      }
      expect(reserved).toBeGreaterThan(0);
      expect(reserved).toBeLessThanOrEqual(6);
      const counters = await docsOf("alice", "quotaCounters");
      expect(counters).toHaveLength(2);
      for (const c of counters) expect(c["reservedMicroUsd"]).toBe(reserved * 50_000);
      const warned = settled.filter(
        (r) =>
          r.status === "fulfilled" &&
          r.value.status === "reserved" &&
          r.value.warningsCrossed.includes("daily"),
      );
      expect(warned.length).toBeLessThanOrEqual(1);
    },
    CONTENTION_TIMEOUT_MS,
  );
});

describe("firestore provider calls end to end", () => {
  it("lease expiry parks an unknown none-provider call and keeps its attempt", async () => {
    await clearFirestore();
    const clock = { nowMs: () => T0 };
    const logger = new CapturingLogger();
    const events = new FirestoreSourceEventRepository(db, clock, logger);
    const calls = new FirestoreProviderCallRepository(db, clock);
    const id = asSourceEventId("evt-1");
    await events.create(owner, {
      sourceEventId: id,
      sourceType: "sms",
      sourceHash: "h",
      idempotencyKey: "k",
      receivedAtMs: T0,
    });
    const n = await events.claim(owner, id, "normalize", "w", T0);
    if (n.status !== "claimed") throw new Error("claim failed");
    await events.commitStage(owner, n.claim, { nextStatus: "normalized", outputs: [] });
    const c = await events.claim(owner, id, "interpret", "w", T0);
    if (c.status !== "claimed") throw new Error("claim failed");
    const call = await calls.getOrCreate(
      owner,
      { sourceEventId: id, stage: "interpret", providerId: "deepseek" },
      "none",
    );
    await calls.beginAttempt(owner, call.id, {}, T0);

    const later = T0 + PIPELINE_TIMEOUTS.leaseMs;
    const recovery = new RecoverExpiredClaims({
      sourceEvents: events,
      providerCalls: calls,
      usage: new FirestoreAiUsageRecorder(db),
      clock,
      logger,
    });
    expect(await recovery.execute(later - 1, 10)).toEqual({
      reopened: 0,
      parked: 0,
      deadLettered: 0,
    });
    expect(await recovery.execute(later, 10)).toEqual({ reopened: 0, parked: 1, deadLettered: 0 });
    expect(await events.get(owner, id)).toMatchObject({
      status: "pending",
      pendingReason: "providerOutcomeUnknown",
      parkedStage: "interpret",
      claim: null,
    });
    expect((await calls.listForStage(owner, id, "interpret"))[0]).toMatchObject({
      state: "unknown",
      attemptCount: 1,
    });
    expect(await docsOf("alice", "aiUsage")).toHaveLength(1);
    for (const name of ["sourceEvents", "providerCalls", "aiUsage"] as const) {
      for (const d of await docsOf("alice", name)) {
        expect(() => OWNER_COLLECTIONS[name].parse(d)).not.toThrow();
      }
    }
  });

  it("the executor stores a result, reuses it, and every document validates", async () => {
    await clearFirestore();
    const clock = { nowMs: () => T0 };
    const logger = new CapturingLogger();
    const executor = new ProviderCallExecutor({
      providerCalls: new FirestoreProviderCallRepository(db, clock),
      quota: new FirestoreQuotaLedger(db, clock, new SequentialIdGenerator()),
      usage: new FirestoreAiUsageRecorder(db),
      clock,
      logger,
      timeoutSignal: systemTimeoutSignal,
    });
    const provider = new FakeProvider("deepseek", "none");
    provider.script({ kind: "success", value: "ok", actualMicroUsd: 3_000 });
    const params = {
      ownerId: owner,
      sourceEventId: asSourceEventId("evt-1"),
      stage: "interpret" as const,
      provider,
      estimateMicroUsd: 10_000,
      invoke: provider.invoke,
    };
    expect(await executor.execute(params)).toMatchObject({ kind: "result", value: "ok" });
    expect(await executor.execute(params)).toMatchObject({ kind: "result", value: "ok" });
    expect(provider.calls).toBe(1);
    const counters = await docsOf("alice", "quotaCounters");
    for (const c of counters) expect(c["reservedMicroUsd"]).toBe(3_000);
    for (const name of ["providerCalls", "aiUsage", "quotaCounters"] as const) {
      const docs = await docsOf("alice", name);
      expect(docs.length).toBeGreaterThan(0);
      for (const d of docs) expect(() => OWNER_COLLECTIONS[name].parse(d)).not.toThrow();
    }
  });
});
