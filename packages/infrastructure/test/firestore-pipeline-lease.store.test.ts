import { asOwnerId } from "@moneytrace/domain";
import { describe, expect, it } from "vitest";
import { FirestorePipelineLease, PIPELINE_LEASE_COLLECTION } from "../src/firestore/firestore-pipeline-lease";
import { testBackend } from "./support/backend";

const { db } = await testBackend();
const owner = () => asOwnerId(`lease-${crypto.randomUUID()}`);
const T = 1_700_000_000_000;

describe("FirestorePipelineLease (one owner's SMS advance one at a time)", () => {
  it("lets one holder in until it releases or the lease runs out", async () => {
    const lease = new FirestorePipelineLease(db);
    const o = owner();
    expect(await lease.acquire(o, "a", T, 60_000)).toBe(true);
    expect(await lease.acquire(o, "b", T + 1_000, 60_000)).toBe(false);
    expect(await lease.acquire(o, "b", T + 60_001, 60_000)).toBe(true);
    await lease.release(o, "a");
    expect(await lease.acquire(o, "c", T + 61_000, 60_000)).toBe(false);
    await lease.release(o, "b");
    expect(await lease.acquire(o, "c", T + 61_000, 60_000)).toBe(true);
  });

  it("owners don't block each other", async () => {
    const lease = new FirestorePipelineLease(db);
    expect(await lease.acquire(owner(), "a", T, 60_000)).toBe(true);
    expect(await lease.acquire(owner(), "b", T, 60_000)).toBe(true);
  });

  it("concurrent acquires let exactly one in", async () => {
    const lease = new FirestorePipelineLease(db);
    const o = owner();
    const got = await Promise.all(["a", "b", "c", "d", "e"].map((h) => lease.acquire(o, h, T, 60_000)));
    expect(got.filter(Boolean)).toHaveLength(1);
  });

  it("a release leaves nothing behind, and an expiry is stored for the cleanup job", async () => {
    const lease = new FirestorePipelineLease(db);
    const o = owner();
    await lease.acquire(o, "a", T, 60_000);
    const ref = db.collection(PIPELINE_LEASE_COLLECTION).doc(o);
    expect((await ref.get()).get("expiresAtMs")).toBe(T + 60_000);
    await lease.release(o, "a");
    expect((await ref.get()).exists).toBe(false);
  });
});
