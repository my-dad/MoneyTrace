import { DomainError, type OwnerId, type SourceEventId } from "@moneytrace/domain";
import type { Clock } from "../ports/clock";
import type { SourceEventRepository } from "../ports/source-event-repository";

type Deps = { sourceEvents: SourceEventRepository; clock: Clock };

export class CancelSourceEvent {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    sourceEventId: SourceEventId;
  }): Promise<{ status: "cancelled" }> {
    const { ownerId, sourceEventId } = input;
    const event = await this.deps.sourceEvents.get(ownerId, sourceEventId);
    if (event === null) throw new DomainError("resourceNotFound", "no such event");
    const done = await this.deps.sourceEvents.finishParked(
      ownerId,
      sourceEventId,
      "cancelled",
      this.deps.clock.nowMs(),
    );
    if (done !== "finished") throw new DomainError("invalidTransition", "this event is not parked");
    return { status: "cancelled" };
  }
}
