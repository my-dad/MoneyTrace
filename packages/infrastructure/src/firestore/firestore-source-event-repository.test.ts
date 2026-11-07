import { CapturingLogger } from "@moneytrace/application/testing";
import { asOwnerId, asSourceEventId } from "@moneytrace/domain";
import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { FirestoreSourceEventRepository } from "./firestore-source-event-repository";

const aborted = (): Error => Object.assign(new Error("aborted"), { code: 10 });
const abortingDb = {
  runTransaction: () => Promise.reject(aborted()),
} as unknown as Firestore;
const ownerId = asOwnerId("alice");
const id = asSourceEventId("evt-1");
const repo = new FirestoreSourceEventRepository(
  abortingDb,
  { nowMs: () => 1_700_000_000_000 },
  new CapturingLogger(),
);

describe("FirestoreSourceEventRepository contention handling", () => {
  it("maps ABORTED during claim to notClaimable liveClaim", async () => {
    expect(await repo.claim(ownerId, id, "normalize", "w1", 1_700_000_000_000)).toEqual({
      status: "notClaimable",
      reason: "liveClaim",
    });
  });

  it("does not mask ABORTED from commitStage", async () => {
    const claim = {
      sourceEventId: id,
      stage: "normalize",
      workerId: "w1",
      version: 1,
      stageAttempt: 0,
      leaseExpiresAtMs: 1_700_000_180_000,
    } as const;
    await expect(
      repo.commitStage(ownerId, claim, { nextStatus: "normalized", outputs: [] }),
    ).rejects.toMatchObject({ code: 10 });
  });

  it("does not map a non-ABORTED claim failure", async () => {
    const other = new FirestoreSourceEventRepository(
      { runTransaction: () => Promise.reject(new Error("boom")) } as unknown as Firestore,
      { nowMs: () => 0 },
      new CapturingLogger(),
    );
    await expect(other.claim(ownerId, id, "normalize", "w1", 0)).rejects.toThrow("boom");
  });
});
