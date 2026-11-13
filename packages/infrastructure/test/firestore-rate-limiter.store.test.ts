import { describeRateLimiterContract } from "@moneytrace/application/testing";
import { describe, expect, it } from "vitest";
import { FirestoreRateLimiter, RATE_LIMIT_COLLECTION } from "../src/firestore/firestore-rate-limiter";
import { testBackend } from "./support/backend";

const { name: backend, db } = await testBackend();
const run = crypto.randomUUID();

describeRateLimiterContract(backend, () => Promise.resolve(new FirestoreRateLimiter(db, run)));

describe("FirestoreRateLimiter", () => {
  it("concurrent calls never exceed the limit", async () => {
    const limiter = new FirestoreRateLimiter(db, `${run}-race`);
    const bucket = { key: "user-race", limit: 3, windowMs: 60_000 };
    const results = await Promise.all(Array.from({ length: 8 }, () => limiter.take([bucket], 1_700_000_040_000)));
    expect(results.filter((r) => r === "allowed")).toHaveLength(3);
  });

  it("stores an expiry so a cleanup job can delete old windows", async () => {
    const limiter = new FirestoreRateLimiter(db, `${run}-ttl`);
    await limiter.take([{ key: "user-ttl", limit: 1, windowMs: 60_000 }], 1_700_000_040_000);
    const docs = (await db.collection(RATE_LIMIT_COLLECTION).where("namespace", "==", `${run}-ttl`).get()).docs;
    expect(docs).toHaveLength(1);
    expect(docs[0]?.get("expiresAtMs")).toBe(1_700_000_100_000 + 60_000);
  });
});
