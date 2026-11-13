import { DEFAULT_RETENTION_POLICY } from "@moneytrace/contracts";
import type { OwnerId, SourceEventId } from "@moneytrace/domain";
import type { Deps } from "./composition";

const BATCH = 100;
/** A message passes at most five stages; the margin covers a stage that hands back to itself. */
const MAX_STAGES = 8;

/** How long a lease lasts, how long a second event waits for it, and how often it looks. */
export const PIPELINE_LEASE_MS = 60_000;
const LEASE_WAIT_MS = 20_000;
const LEASE_POLL_MS = 100;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs an event's stages one after another until none is left or one doesn't complete (CR-010).
 * Firebase did this with a trigger on every write; a crash here leaves the event to the sweep and
 * to `recoverExpiredClaims`, exactly as a lost trigger did.
 *
 * One owner's events take turns (a per-owner lease): the second half of an own transfer pasted at
 * the same moment as the first must see the first posted to pair with it (CR-008). An event that
 * can't get its turn in time is left to the sweep, which drives it later.
 */
export async function drivePipeline(deps: Deps, ownerId: OwnerId, sourceEventId: SourceEventId): Promise<number> {
  const { lease, nowMs } = deps.pipelineLease;
  const holder = `${sourceEventId}-${deps.ids.newId()}`;
  const deadline = nowMs() + LEASE_WAIT_MS;
  while (!(await lease.acquire(ownerId, holder, nowMs(), PIPELINE_LEASE_MS))) {
    if (nowMs() >= deadline) return 0;
    await sleep(LEASE_POLL_MS);
  }
  try {
    for (let stages = 0; stages < MAX_STAGES; stages++) {
      const r = await deps.advanceSourceEvent.execute({
        ownerId,
        sourceEventId,
        workerId: `${sourceEventId}-${deps.ids.newId()}`.slice(0, 128),
      });
      if (r.status !== "completed") return stages;
    }
    return MAX_STAGES;
  } finally {
    await lease.release(ownerId, holder);
  }
}

/** The scheduled jobs, free of any scheduler. `advancePending` is the trigger's sweep. */
export const JOBS = {
  recoverExpiredClaims: async (deps: Deps, nowMs: number) => {
    await deps.recoverExpiredClaims.execute(nowMs, BATCH);
  },
  /** Push is deferred, so this only brings snoozed questions back. */
  dispatchFollowUps: async (deps: Deps, nowMs: number) => {
    await deps.wakeSnoozedFollowUps.execute(nowMs, BATCH);
  },
  resumeQuotaBlockedEvents: async (deps: Deps, nowMs: number) => {
    await deps.resumeQuotaBlockedEvents.execute(nowMs, BATCH);
  },
  purgeProviderResults: async (deps: Deps, nowMs: number) => {
    await deps.purgeProviderResults.execute(nowMs, DEFAULT_RETENTION_POLICY, BATCH);
  },
  advancePending: async (deps: Deps) => {
    for (const e of await deps.runnableEvents(BATCH)) {
      await drivePipeline(deps, e.ownerId, e.sourceEventId);
    }
  },
} as const;

export type JobName = keyof typeof JOBS;
