import { TRIGGERS } from "@moneytrace/contracts";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { REGION, TIMEOUT_SECONDS } from "../callable/create-callable";
import type { Deps } from "../composition";
import { JOBS } from "../jobs";

const options = (schedule: string) => ({
  schedule,
  region: REGION,
  timeoutSeconds: TIMEOUT_SECONDS,
  maxInstances: 1,
});

export const recoverExpiredClaims = (getDeps: () => Deps) =>
  onSchedule(options(TRIGGERS.recoverExpiredClaims.source), async () => {
    await JOBS.recoverExpiredClaims(getDeps(), Date.now());
  });

/** Push is deferred to Phase 0B, so this only brings snoozed questions back. */
export const dispatchFollowUps = (getDeps: () => Deps) =>
  onSchedule(options(TRIGGERS.dispatchFollowUps.source), async () => {
    await JOBS.dispatchFollowUps(getDeps(), Date.now());
  });

export const resumeQuotaBlockedEvents = (getDeps: () => Deps) =>
  onSchedule(options(TRIGGERS.resumeQuotaBlockedEvents.source), async () => {
    await JOBS.resumeQuotaBlockedEvents(getDeps(), Date.now());
  });

export const purgeProviderResults = (getDeps: () => Deps) =>
  onSchedule(options(TRIGGERS.purgeProviderResults.source), async () => {
    await JOBS.purgeProviderResults(getDeps(), Date.now());
  });
