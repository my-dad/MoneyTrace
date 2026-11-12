/** One fixed-window counter: at most `limit` calls per `windowMs` for this key. */
export type RateBucket = { key: string; limit: number; windowMs: number };

/**
 * Counts one call against every bucket, all or nothing: if any bucket is full, nothing is counted
 * and the call is "limited". Keys must never contain raw personal data (hash IPs first).
 */
export interface RateLimiter {
  take(buckets: readonly RateBucket[], nowMs: number): Promise<"allowed" | "limited">;
}

/** The window a call at `nowMs` falls in, as a stable document-safe id. */
export function rateWindowId(bucket: RateBucket, nowMs: number): string {
  return `${bucket.key}_${String(Math.floor(nowMs / bucket.windowMs))}`;
}
