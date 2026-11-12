import { describeRateLimiterContract } from "@moneytrace/application/testing";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, type Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { FirestoreRateLimiter, RATE_LIMIT_COLLECTION } from "../src/firestore/firestore-rate-limiter";

const PROJECT_ID = "demo-moneytrace";
if (process.env["FIRESTORE_EMULATOR_HOST"] === undefined) throw new Error("run through `firebase emulators:exec`");
const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));
const run = crypto.randomUUID();

describeRateLimiterContract("firestore", () => Promise.resolve(new FirestoreRateLimiter(db, run)));

describe("FirestoreRateLimiter", () => {
  it("concurrent calls never exceed the limit", async () => {
    const limiter = new FirestoreRateLimiter(db, `${run}-race`);
    const bucket = { key: "user-race", limit: 3, windowMs: 60_000 };
    const results = await Promise.all(Array.from({ length: 8 }, () => limiter.take([bucket], 1_700_000_040_000)));
    expect(results.filter((r) => r === "allowed")).toHaveLength(3);
  });

  it("stores an expiry so a TTL policy can delete old windows", async () => {
    const limiter = new FirestoreRateLimiter(db, `${run}-ttl`);
    await limiter.take([{ key: "user-ttl", limit: 1, windowMs: 60_000 }], 1_700_000_040_000);
    const docs = (await db.collection(RATE_LIMIT_COLLECTION).where("namespace", "==", `${run}-ttl`).get()).docs;
    expect(docs).toHaveLength(1);
    expect((docs[0]?.get("expiresAt") as Timestamp).toMillis()).toBe(1_700_000_100_000 + 60_000);
  });
});
