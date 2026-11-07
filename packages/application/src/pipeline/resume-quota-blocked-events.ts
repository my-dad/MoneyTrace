import type { OwnerId } from "@moneytrace/domain";
import type { Clock } from "../ports/clock";
import type { QuotaLedger, QuotaLimits } from "../ports/quota-ledger";
import type { SourceEventRepository } from "../ports/source-event-repository";

type Deps = {
  sourceEvents: SourceEventRepository;
  quota: QuotaLedger;
  clock: Clock;
  limits: QuotaLimits;
  estimateMicroUsd: number;
};

/**
 * Reopens events parked on quota, oldest first, only as many as an owner's budget can now take.
 * Reopening goes through the claim protocol, so a repeat run is harmless. An unknown provider
 * outcome is never touched: repeating that may cost a second charge, so it waits for the user.
 */
export class ResumeQuotaBlockedEvents {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(nowMs: number, limit: number): Promise<{ reopened: number }> {
    const { sourceEvents, quota, limits, estimateMicroUsd } = this.deps;
    const rows = await sourceEvents.listPendingByReason("aiQuotaExhausted", limit);
    const remaining = new Map<OwnerId, number>();
    let reopened = 0;
    for (const { ownerId, sourceEventId, version } of rows) {
      let left = remaining.get(ownerId);
      left ??= await quota.availableMicroUsd(ownerId, nowMs, limits);
      if (left < estimateMicroUsd) {
        remaining.set(ownerId, left);
        continue;
      }
      if ((await sourceEvents.reopen(ownerId, sourceEventId, version, nowMs)) === "reopened") {
        reopened += 1;
        left -= estimateMicroUsd;
      }
      remaining.set(ownerId, left);
    }
    return { reopened };
  }
}
