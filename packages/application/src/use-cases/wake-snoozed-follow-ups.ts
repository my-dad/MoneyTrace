import type { FollowUpRepository } from "../ports/follow-up-repository";
import type { Logger } from "../ports/logger";

export class WakeSnoozedFollowUps {
  private readonly deps: { followUps: FollowUpRepository; logger: Logger };

  constructor(deps: { followUps: FollowUpRepository; logger: Logger }) {
    this.deps = deps;
  }

  /** Overlapping runs are harmless: each wake re-checks, and only one reopens a follow-up. */
  async execute(nowMs: number, limit: number): Promise<{ woken: number }> {
    const { followUps, logger } = this.deps;
    let woken = 0;
    for (const { ownerId, id } of await followUps.listDueToWake(nowMs, limit)) {
      if ((await followUps.wake(ownerId, id, nowMs)) === "woken") woken += 1;
    }
    logger.info("followUps.woken", { status: String(woken) });
    return { woken };
  }
}
