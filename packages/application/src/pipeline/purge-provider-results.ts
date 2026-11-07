import type { RetentionPolicy } from "@moneytrace/contracts";
import {
  STAGE_INPUT_STATUS,
  type OwnerId,
  type PipelineStage,
  type SourceEventId,
} from "@moneytrace/domain";
import type { Logger } from "../ports/logger";
import type { ProviderCallRepository } from "../ports/provider-call-repository";
import { hasResult } from "../provider-call-guards";

const DAY_MS = 86_400_000;
const STAGES = Object.keys(STAGE_INPUT_STATUS) as PipelineStage[];

export type PurgeProviderResultsDeps = { providerCalls: ProviderCallRepository; logger: Logger };

/**
 * Clears stored provider results once the event is terminal and past the retention window. A
 * pending or dead-letter event is never terminal, so its results stay however old they are; the
 * repository re-checks the event inside its own transaction.
 */
export class PurgeProviderResults {
  private readonly deps: PurgeProviderResultsDeps;

  constructor(deps: PurgeProviderResultsDeps) {
    this.deps = deps;
  }

  async execute(
    nowMs: number,
    policy: RetentionPolicy,
    limit: number,
  ): Promise<{ purged: number }> {
    const { providerCalls, logger } = this.deps;
    const cutoff = nowMs - policy.providerResultDays * DAY_MS;
    let purged = 0;
    let done = 0;
    // An event that keeps failing stays at the front of the oldest-first list. It is logged and
    // paged past, by asking for that many more candidates, so it cannot starve the others.
    const failed = new Set<string>();
    while (done < limit) {
      const asked = limit + failed.size;
      const batch = await providerCalls.listPurgeCandidates(cutoff, asked);
      const fresh = batch.filter((c) => !failed.has(`${c.ownerId}/${c.sourceEventId}`));
      for (const { ownerId, sourceEventId } of fresh.slice(0, limit - done)) {
        try {
          purged += await this.purgeEvent(ownerId, sourceEventId, nowMs);
          done += 1;
        } catch (error) {
          failed.add(`${ownerId}/${sourceEventId}`);
          logger.error("retention.purgeFailed", {
            sourceEventId,
            errorName: error instanceof Error ? error.name : "unknown",
          });
        }
      }
      if (fresh.length === 0 || batch.length < asked) break;
    }
    return { purged };
  }
  /** Purges every stored result of one event, then flags the event. Returns the results cleared. */
  private async purgeEvent(
    ownerId: OwnerId,
    sourceEventId: SourceEventId,
    nowMs: number,
  ): Promise<number> {
    const { providerCalls } = this.deps;
    let purged = 0;
    for (const stage of STAGES) {
      for (const call of await providerCalls.listForStage(ownerId, sourceEventId, stage)) {
        if (!hasResult(call)) continue;
        if ((await providerCalls.purgeResult(ownerId, call.id, nowMs)) === "purged") purged += 1;
      }
    }
    await providerCalls.completeEventPurge(ownerId, sourceEventId);
    return purged;
  }
}
