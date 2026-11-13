import { DEFAULT_RETENTION_POLICY } from "@moneytrace/contracts";
import type { OwnerId, SourceEventId } from "@moneytrace/domain";
import type { Deps } from "./composition";

const BATCH = 100;
/** A message passes at most five stages; the margin covers a stage that hands back to itself. */
const MAX_STAGES = 8;

/**
 * Runs an event's stages one after another until none is left or one doesn't complete (CR-010).
 * Firebase did this with a trigger on every write; a crash here leaves the event to the sweep and
 * to `recoverExpiredClaims`, exactly as a lost trigger did.
 */
export async function drivePipeline(deps: Deps, ownerId: OwnerId, sourceEventId: SourceEventId): Promise<number> {
  for (let stages = 0; stages < MAX_STAGES; stages++) {
    const r = await deps.advanceSourceEvent.execute({
      ownerId,
      sourceEventId,
      workerId: `${sourceEventId}-${deps.ids.newId()}`.slice(0, 128),
    });
    if (r.status !== "completed") return stages;
  }
  return MAX_STAGES;
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
