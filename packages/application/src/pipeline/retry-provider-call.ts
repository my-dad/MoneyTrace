import type { OwnerId, PipelineStage, SourceEventId } from "@moneytrace/domain";
import type { Clock } from "../ports/clock";
import type { ProviderCallRepository } from "../ports/provider-call-repository";
import type { SourceEventRepository } from "../ports/source-event-repository";
import { hasResult, isUnresolved } from "../provider-call-guards";

export type RetryProviderCallDeps = {
  sourceEvents: SourceEventRepository;
  providerCalls: ProviderCallRepository;
  clock: Clock;
};

/**
 * The user's explicit decision to call a provider again after an unknown outcome or a missing
 * result. The approval is stored on the call and consumed by the next attempt; the event is then
 * reopened from where it parked. Any other parked event is not retryable here.
 */
export class RetryProviderCall {
  private readonly deps: RetryProviderCallDeps;

  constructor(deps: RetryProviderCallDeps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    sourceEventId: SourceEventId;
    stage: PipelineStage;
  }): Promise<"reopened" | "notRetryable"> {
    const { sourceEvents, providerCalls, clock } = this.deps;
    const { ownerId, sourceEventId, stage } = input;
    const event = await sourceEvents.get(ownerId, sourceEventId);
    if (event === null || event.claim !== null || event.parkedStage !== stage)
      return "notRetryable";
    const parkedOnProvider =
      (event.status === "pending" && event.pendingReason === "providerOutcomeUnknown") ||
      (event.status === "deadLetter" && event.deadLetterReason === "providerResultMissing");
    if (!parkedOnProvider) return "notRetryable";

    const calls = await providerCalls.listForStage(ownerId, sourceEventId, stage);
    // A result stored after the event parked (a late worker) needs no approval: the executor
    // reuses it and the provider is not called again.
    if (!calls.some(hasResult)) {
      // Only the most recently attempted unresolved call is approved, so an older fallback's
      // outcome is not re-run by this one decision.
      const [latest] = calls
        .filter(isUnresolved)
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs || a.id.localeCompare(b.id));
      if (latest === undefined) return "notRetryable";
      await providerCalls.approveRetry(ownerId, latest.id, clock.nowMs());
    }
    const reopened = await sourceEvents.reopen(
      ownerId,
      sourceEventId,
      event.version,
      clock.nowMs(),
    );
    return reopened === "reopened" ? "reopened" : "notRetryable";
  }
}
