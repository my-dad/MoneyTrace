import { rateWindowId, type RateBucket, type RateLimiter } from "../ports/rate-limiter";

export class InMemoryRateLimiter implements RateLimiter {
  private readonly counts = new Map<string, number>();

  take(buckets: readonly RateBucket[], nowMs: number): Promise<"allowed" | "limited"> {
    const ids = buckets.map((b) => rateWindowId(b, nowMs));
    if (buckets.some((b, i) => (this.counts.get(ids[i] ?? "") ?? 0) >= b.limit)) return Promise.resolve("limited");
    for (const id of ids) this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
    return Promise.resolve("allowed");
  }
}
