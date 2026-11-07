import { DEFAULT_RETENTION_POLICY, TRIGGERS } from "@moneytrace/contracts";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { REGION, TIMEOUT_SECONDS } from "../callable/create-callable";
import type { Deps } from "../composition";

const BATCH = 100;
const options = (schedule: string) => ({
  schedule,
  region: REGION,
  timeoutSeconds: TIMEOUT_SECONDS,
  maxInstances: 1,
});

export const recoverExpiredClaims = (getDeps: () => Deps) =>
  onSchedule(options(TRIGGERS.recoverExpiredClaims.source), async () => {
    await getDeps().recoverExpiredClaims.execute(Date.now(), BATCH);
  });

/** Push is deferred to Phase 0B, so this only brings snoozed questions back. */
export const dispatchFollowUps = (getDeps: () => Deps) =>
  onSchedule(options(TRIGGERS.dispatchFollowUps.source), async () => {
    await getDeps().wakeSnoozedFollowUps.execute(Date.now(), BATCH);
  });

export const resumeQuotaBlockedEvents = (getDeps: () => Deps) =>
  onSchedule(options(TRIGGERS.resumeQuotaBlockedEvents.source), async () => {
    await getDeps().resumeQuotaBlockedEvents.execute(Date.now(), BATCH);
  });

export const purgeProviderResults = (getDeps: () => Deps) =>
  onSchedule(options(TRIGGERS.purgeProviderResults.source), async () => {
    await getDeps().purgeProviderResults.execute(Date.now(), DEFAULT_RETENTION_POLICY, BATCH);
  });
