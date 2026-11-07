import {
  DomainError,
  type OwnerId,
  type SourceEventId,
  type SourceEventStatus,
} from "@moneytrace/domain";
import type { RetryProviderCall } from "../pipeline/retry-provider-call";
import type { Clock } from "../ports/clock";
import type { SourceEventRepository } from "../ports/source-event-repository";

type Deps = {
  sourceEvents: SourceEventRepository;
  retryProvider: RetryProviderCall;
  clock: Clock;
};

/** The user's Retry button. A quota wait needs no approval; a possible second charge does. */
export class RetrySourceEvent {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    sourceEventId: SourceEventId;
  }): Promise<{ status: SourceEventStatus }> {
    const { ownerId, sourceEventId } = input;
    const { sourceEvents, retryProvider, clock } = this.deps;
    const event = await sourceEvents.get(ownerId, sourceEventId);
    if (event === null) throw new DomainError("resourceNotFound", "no such event");
    const refused = new DomainError("invalidTransition", "this event cannot be retried");
    let outcome: string;
    if (event.status === "pending" && event.pendingReason === "aiQuotaExhausted") {
      outcome = await sourceEvents.reopen(ownerId, sourceEventId, event.version, clock.nowMs());
    } else if (event.parkedStage !== null) {
      outcome = await retryProvider.execute({ ownerId, sourceEventId, stage: event.parkedStage });
    } else {
      throw refused;
    }
    if (outcome !== "reopened") throw refused;
    const fresh = await sourceEvents.get(ownerId, sourceEventId);
    return { status: fresh?.status ?? event.status };
  }
}
