import { nextProviderAction } from "@moneytrace/domain";
import type { Clock } from "../ports/clock";
import type { Logger } from "../ports/logger";
import type { ProviderCallRecord, ProviderCallRepository } from "../ports/provider-call-repository";
import type {
  ExpiredClaim,
  Parking,
  SourceEventRepository,
} from "../ports/source-event-repository";
import type { AIUsageRecord, AIUsageRecorder } from "../ports/ai-usage-recorder";
import { isLeaseExpired } from "../source-event-guards";
import { hasResult, workerDiedUsage } from "../provider-call-guards";
import { PIPELINE_TIMEOUTS } from "./timeouts";

export type RecoverExpiredClaimsDeps = {
  sourceEvents: SourceEventRepository;
  providerCalls: ProviderCallRepository;
  usage: AIUsageRecorder;
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
    // The row may be stale: another recovery or a new worker can have moved the event since it
    // was listed. Only an event still at the listed version with an expired lease is recovered;
    // anything else is skipped, so a live attempt is never marked unknown.
    const current = await sourceEvents.get(claim.ownerId, claim.sourceEventId);
    if (
      current === null ||
      current.version !== claim.version ||
      current.claim === null ||
      !isLeaseExpired(current.claim.leaseExpiresAtMs, nowMs)
    ) {
      return;
    }
    const listed = await providerCalls.listForStage(
      claim.ownerId,
      claim.sourceEventId,
      claim.stage,
    );
    const calls: ProviderCallRecord[] = [];
    for (const c of listed) {
      if (c.state === "succeeded" && hasResult(c)) {
        // A late success can hide a later attempt that died: meter that attempt too.
        calls.push(c);
        await this.meter(claim, workerDiedUsage(c, nowMs));
        continue;
      }
      if (c.state !== "started") {
        calls.push(c);
        continue;
      }
      const updated = await providerCalls.markUnknown(
        claim.ownerId,
        c.id,
        c.attemptCount,
        "workerDied",
        nowMs,
      );
      calls.push(updated);
      if (updated.state === "unknown") await this.meter(claim, workerDiedUsage(c, nowMs));
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

  private async meter(claim: ExpiredClaim, record: AIUsageRecord): Promise<void> {
    try {
      await this.deps.usage.appendIfAbsent(claim.ownerId, record);
    } catch (error) {
      this.deps.logger.error("aiUsage.appendFailed", {
        sourceEventId: claim.sourceEventId,
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
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
    // A stored result is reused for free, so the stage reopens even when out of attempts. The
    // allowance is bounded, so a stage that keeps crashing after reuse still ends in the Inbox.
    if (calls.some(hasResult) && stageAttempt < max * 2) return { kind: "reopen" };
    if (stageAttempt >= max) {
      return { kind: "park", parking: { status: "deadLetter", reason: "attemptsExhausted" } };
    }
    return { kind: "reopen" };
  }
}
