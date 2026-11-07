import type { RetentionPolicy } from "@moneytrace/contracts";
import { STAGE_INPUT_STATUS, type PipelineStage } from "@moneytrace/domain";
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
    for (const candidate of await providerCalls.listPurgeCandidates(cutoff, limit)) {
      const { ownerId, sourceEventId } = candidate;
      try {
        for (const stage of STAGES) {
          for (const call of await providerCalls.listForStage(ownerId, sourceEventId, stage)) {
            if (!hasResult(call)) continue;
            if ((await providerCalls.purgeResult(ownerId, call.id, nowMs)) === "purged")
              purged += 1;
          }
        }
        await providerCalls.completeEventPurge(ownerId, sourceEventId);
      } catch (error) {
        logger.error("retention.purgeFailed", {
          sourceEventId,
          errorName: error instanceof Error ? error.name : "unknown",
        });
      }
    }
    return { purged };
  }
}
