import type { OwnerId } from "@moneytrace/domain";

/**
 * One owner's evidence advances through the pipeline one event at a time, so the second half of
 * an own transfer always sees the first already posted and pairs with it (CR-008). A lease, not a
 * lock: it runs out by itself if its holder dies.
 */
export interface PipelineLease {
  /** True when `holder` now holds the owner's lease, until `nowMs + leaseMs`. */
  acquire(ownerId: OwnerId, holder: string, nowMs: number, leaseMs: number): Promise<boolean>;
  /** Gives the lease up if `holder` still holds it; otherwise does nothing. */
  release(ownerId: OwnerId, holder: string): Promise<void>;
}
