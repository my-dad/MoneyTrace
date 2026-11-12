import { rateWindowId, type RateBucket, type RateLimiter } from "@moneytrace/application";
import { Timestamp, type Firestore } from "firebase-admin/firestore";

/** Admin-only: the security rules match no client path here. A TTL policy on `expiresAt` cleans it. */
export const RATE_LIMIT_COLLECTION = "rateLimits";

/**
 * Fixed-window counters, one document per key and window, checked and counted in one
 * transaction so concurrent calls serialize. `namespace` keeps environments or test runs apart.
 */
export class FirestoreRateLimiter implements RateLimiter {
  private readonly db: Firestore;
  private readonly namespace: string;

  constructor(db: Firestore, namespace = "callables") {
    this.db = db;
    this.namespace = namespace;
  }

  async take(buckets: readonly RateBucket[], nowMs: number): Promise<"allowed" | "limited"> {
    const refs = buckets.map((b) => this.db.collection(RATE_LIMIT_COLLECTION).doc(`${this.namespace}_${rateWindowId(b, nowMs)}`));
    return this.db.runTransaction(async (t) => {
      const snaps = await Promise.all(refs.map((r) => t.get(r)));
      const counts = snaps.map((s) => (s.exists ? Number(s.get("count")) : 0));
      if (buckets.some((b, i) => (counts[i] ?? 0) >= b.limit)) return "limited";
      buckets.forEach((b, i) => {
        const windowEndMs = (Math.floor(nowMs / b.windowMs) + 1) * b.windowMs;
        const ref = refs[i];
        if (ref === undefined) return;
        t.set(ref, {
          namespace: this.namespace,
          count: (counts[i] ?? 0) + 1,
          expiresAt: Timestamp.fromMillis(windowEndMs + b.windowMs),
        });
      });
      return "allowed";
    });
  }
}
