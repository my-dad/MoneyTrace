import { DomainError, detectSensitiveContent, maskIdentifiers, type OwnerId, type SourceEventId } from "@moneytrace/domain";
import type { Clock } from "../ports/clock";
import type { SourceEventRepository } from "../ports/source-event-repository";
import { SKIPPED_ANSWER } from "../source-event-guards";

type Deps = { sourceEvents: SourceEventRepository; clock: Clock };

/**
 * The user's answer to DeepSeek's latest question about a pasted message (CR-008). The answer is
 * stored with the message and the message is read again; a skip goes on with the reading so far.
 * An answer that looks like a secret is refused before it is stored or sent anywhere.
 */
export class AnswerQuestion {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    sourceEventId: SourceEventId;
    answer?: string;
    skip?: true;
  }): Promise<{ status: "received" }> {
    const { sourceEvents, clock } = this.deps;
    const text = input.skip === true ? SKIPPED_ANSWER : (input.answer ?? "").trim();
    if (text === "") throw new DomainError("invalidIntent", "give an answer or skip");
    if (input.skip !== true && detectSensitiveContent(text) !== null) {
      throw new DomainError("sensitiveEvidence", "the answer contains a secret");
    }
    const event = await sourceEvents.get(input.ownerId, input.sourceEventId);
    if (event === null) throw new DomainError("resourceNotFound", "no such event");
    const nowMs = clock.nowMs();
    if ((await sourceEvents.recordAnswer(input.ownerId, event.id, maskIdentifiers(text), nowMs)) !== "applied") {
      throw new DomainError("invalidTransition", "this message isn't waiting for an answer");
    }
    const fresh = await sourceEvents.get(input.ownerId, event.id);
    const reopened = fresh === null ? "stale" : await sourceEvents.reopen(input.ownerId, event.id, fresh.version, nowMs);
    if (reopened !== "reopened") throw new DomainError("invalidTransition", "the message has moved on");
    return { status: "received" };
  }
}
