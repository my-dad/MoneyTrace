import { DomainError, type OwnerId } from "@moneytrace/domain";
import type { Clock } from "../ports/clock";
import type { FollowUpRepository } from "../ports/follow-up-repository";

export class SnoozeFollowUp {
  private readonly deps: { followUps: FollowUpRepository; clock: Clock };

  constructor(deps: { followUps: FollowUpRepository; clock: Clock }) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    followUpId: string;
    untilMs: number;
  }): Promise<{ state: "snoozed" }> {
    const { ownerId, followUpId, untilMs } = input;
    if (untilMs <= this.deps.clock.nowMs()) {
      throw new DomainError("invalidIntent", "choose a time in the future");
    }
    const followUp = await this.deps.followUps.get(ownerId, followUpId);
    if (followUp === null) throw new DomainError("resourceNotFound", "no such follow-up");
    const result = await this.deps.followUps.snooze(ownerId, followUpId, untilMs);
    if (result !== "snoozed") throw new DomainError("invalidTransition", "already answered");
    return { state: "snoozed" };
  }
}
