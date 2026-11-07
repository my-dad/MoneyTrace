import {
  DomainError,
  asSourceEventId,
  defaultParsers,
  detectSensitiveContent,
  evaluateParsers,
  maskIdentifiers,
  type OwnerId,
  type SourceEventStatus,
} from "@moneytrace/domain";
import type { Clock } from "../ports/clock";
import type { Hasher } from "../ports/hasher";
import type { IdGenerator } from "../ports/id-generator";
import type { Logger } from "../ports/logger";
import type { SourceEventRepository } from "../ports/source-event-repository";

type Deps = {
  sourceEvents: SourceEventRepository;
  hasher: Hasher;
  ids: IdGenerator;
  clock: Clock;
  logger: Logger;
};

export type IntakeResult = {
  sourceEventId: string;
  status: SourceEventStatus;
  duplicate: boolean;
};

/** The only way evidence enters the system. Secrets are refused before anything is written. */
export class IntakeEvidence {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    idempotencyKey: string;
    text: string;
  }): Promise<IntakeResult> {
    const { sourceEvents, hasher, ids, clock } = this.deps;
    const trimmed = input.text.trim();
    if (trimmed === "") throw new DomainError("invalidIntent", "evidence must not be blank");
    if (detectSensitiveContent(trimmed) !== null) {
      this.deps.logger.warn("evidence.refusedSensitive", {});
      throw new DomainError("sensitiveEvidence", "evidence contains a secret");
    }
    const retainedText = maskIdentifiers(trimmed);
    const recognized = evaluateParsers(defaultParsers, retainedText).outcome !== "none";
    const created = await sourceEvents.create(input.ownerId, {
      sourceEventId: asSourceEventId(ids.newId()),
      sourceType: recognized ? "sms" : "chat",
      sourceHash: hasher.sha256(retainedText),
      idempotencyKey: input.idempotencyKey,
      receivedAtMs: clock.nowMs(),
      retainedText,
    });
    if (created.status === "idempotencyConflict") {
      throw new DomainError("idempotencyConflict", "that key was used for different evidence");
    }
    const event = await sourceEvents.get(input.ownerId, created.sourceEventId);
    return {
      sourceEventId: created.sourceEventId,
      status: event?.status ?? "received",
      duplicate: created.status === "duplicate",
    };
  }
}
