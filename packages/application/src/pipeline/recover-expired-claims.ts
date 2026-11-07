import { nextProviderAction } from "@moneytrace/domain";
import type { Clock } from "../ports/clock";
import type { Logger } from "../ports/logger";
import type { ProviderCallRecord, ProviderCallRepository } from "../ports/provider-call-repository";
import type {
  ExpiredClaim,
  Parking,
  SourceEventRepository,
} from "../ports/source-event-repository";
import { hasResult } from "../provider-call-guards";
import { PIPELINE_TIMEOUTS } from "./timeouts";

export type RecoverExpiredClaimsDeps = {
  sourceEvents: SourceEventRepository;
  providerCalls: ProviderCallRepository;
  clock: Clock;
  logger: Logger;
  maxAttempts?: number;
};

export type RecoveryResult = { reopened: number; parked: number; deadLettered: number };

type Decision = { kind: "reopen" } | { kind: "park"; parking: Parking };

/**
 * Applies the ProviderCall protocol to claims whose lease has expired. A call still `started` is
 * recorded `unknown` (the worker ended, but the provider may have processed the request). The
 * stage is then reopened only when the protocol allows another attempt; a `none` provider with an
 * unknown outcome, or a result that went missing, waits for the user instead.
 */
export class RecoverExpiredClaims {
  private readonly deps: RecoverExpiredClaimsDeps;

  constructor(deps: RecoverExpiredClaimsDeps) {
    this.deps = deps;
  }

  async execute(nowMs: number, limit: number): Promise<RecoveryResult> {
    const out: RecoveryResult = { reopened: 0, parked: 0, deadLettered: 0 };
    const expired = await this.deps.sourceEvents.listExpiredClaims(nowMs, limit);
    for (const claim of expired) {
      try {
        await this.recoverOne(claim, nowMs, out);
      } catch (error) {
        // One failing event must not stop recovery of the others; it stays claimed and is retried.
        this.deps.logger.error("recovery.eventFailed", {
          sourceEventId: claim.sourceEventId,
          stage: claim.stage,
          errorName: error instanceof Error ? error.name : "unknown",
        });
      }
    }
    return out;
  }

  private async recoverOne(claim: ExpiredClaim, nowMs: number, out: RecoveryResult): Promise<void> {
    const { sourceEvents, providerCalls } = this.deps;
    const listed = await providerCalls.listForStage(
      claim.ownerId,
      claim.sourceEventId,
      claim.stage,
    );
    const calls: ProviderCallRecord[] = [];
    for (const c of listed) {
      calls.push(
        c.state === "started"
          ? await providerCalls.markUnknown(claim.ownerId, c.id, "workerDied", nowMs)
          : c,
      );
    }
    const decision = this.decide(calls, claim.stageAttempt);
    if (decision.kind === "reopen") {
      const r = await sourceEvents.reopen(claim.ownerId, claim.sourceEventId, claim.version, nowMs);
      if (r === "reopened") out.reopened += 1;
      return;
    }
    const r = await sourceEvents.park(
      claim.ownerId,
      claim.sourceEventId,
      claim.version,
      decision.parking,
      nowMs,
    );
    if (r !== "parked") return;
    if (decision.parking.status === "pending") out.parked += 1;
    else out.deadLettered += 1;
  }

  private decide(calls: readonly ProviderCallRecord[], stageAttempt: number): Decision {
    const max = this.deps.maxAttempts ?? PIPELINE_TIMEOUTS.maxAttempts;
    // A stored approval lets the stage run once more, even when it is out of attempts only by the
    // user's own retries; with no attempts left, the approval keeps waiting in the Inbox.
    const approved = (c: ProviderCallRecord): boolean => c.userApprovedRetry && stageAttempt < max;
    const blocked = (c: ProviderCallRecord): boolean => {
      if (approved(c)) return false;
      const action = nextProviderAction({
        state: c.state,
        hasResult: hasResult(c),
        retrySafety: c.retrySafety,
        attemptCount: c.attemptCount,
        maxAttempts: max,
        userApprovedRetry: false,
      });
      return action === "resultMissing" || action === "awaitUserDecision";
    };
    const waiting = calls.filter((c) => c.attemptCount > 0 && blocked(c));
    if (waiting.some((c) => c.state === "succeeded" || c.state === "purged")) {
      return { kind: "park", parking: { status: "deadLetter", reason: "providerResultMissing" } };
    }
    if (waiting.length > 0) {
      return { kind: "park", parking: { status: "pending", reason: "providerOutcomeUnknown" } };
    }
    if (stageAttempt >= max) {
      return { kind: "park", parking: { status: "deadLetter", reason: "attemptsExhausted" } };
    }
    return { kind: "reopen" };
  }
}
