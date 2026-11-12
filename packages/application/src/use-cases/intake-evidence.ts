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
    const evaluation = evaluateParsers(defaultParsers, retainedText);
    const recognized = evaluation.outcome !== "none";
    // A dated SMS is the same evidence whenever it's pasted. Undated evidence (a monthly installment
    // SMS, a cash note) repeats word for word, so it is only "the same" within one Dhaka day.
    const dated =
      evaluation.outcome === "match" &&
      evaluation.parsed.kind === "transaction" &&
      evaluation.parsed.candidate.occurredAtMs !== null;
    const sourceHash = hasher.sha256(dated ? retainedText : `${dhakaDay(clock.nowMs())}\n${retainedText}`);
    const created = await sourceEvents.create(input.ownerId, {
      sourceEventId: asSourceEventId(ids.newId()),
      sourceType: recognized ? "sms" : "chat",
      sourceHash,
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

/** "2026-11-12" in Asia/Dhaka (fixed UTC+6). */
function dhakaDay(nowMs: number): string {
  return new Date(nowMs + 6 * 3_600_000).toISOString().slice(0, 10);
}
