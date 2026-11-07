import {
  nextProviderAction,
  type OwnerId,
  type PipelineStage,
  type RetrySafety,
  type SourceEventId,
} from "@moneytrace/domain";
import type { AIUsageRecord, AIUsageRecorder } from "../ports/ai-usage-recorder";
import type { Clock } from "../ports/clock";
import type { Logger } from "../ports/logger";
import type { ProviderCallRecord, ProviderCallRepository } from "../ports/provider-call-repository";
import { DEFAULT_QUOTA_LIMITS, type QuotaLedger, type QuotaLimits } from "../ports/quota-ledger";
import {
  assertStorableResult,
  hasResult,
  isUnattempted,
  safeErrorCode,
  workerDiedUsage,
} from "../provider-call-guards";
import { makeReservationId } from "../quota-rules";
import { PIPELINE_TIMEOUTS } from "./timeouts";

/** What the executor needs of an `AbortSignal`; the platform's own signal satisfies it. */
export type AbortSignalLike = {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: "abort", listener: () => void): void;
};

export type ProviderOutcome<T> =
  | { kind: "success"; value: T; actualMicroUsd?: number }
  | { kind: "definiteFailure"; code: string }
  | { kind: "unknown"; code: string };

export type ExecuteResult<T> =
  | { kind: "result"; value: T; retriedAfterUnknown: boolean }
  | { kind: "retryLater" }
  | { kind: "awaitUserDecision" }
  | { kind: "resultMissing" }
  | { kind: "exhausted" }
  | { kind: "quotaExhausted"; window: string };

export type ExecuteParams<T> = {
  ownerId: OwnerId;
  sourceEventId: SourceEventId;
  stage: PipelineStage;
  provider: { id: string; retrySafety: RetrySafety };
  estimateMicroUsd: number;
  /** The adapter call. It receives the stable request key and a signal that aborts at the timeout. */
  invoke(requestKey: string, signal: AbortSignalLike): Promise<ProviderOutcome<T>>;
};

export type ProviderCallExecutorDeps = {
  providerCalls: ProviderCallRepository;
  quota: QuotaLedger;
  usage: AIUsageRecorder;
  clock: Clock;
  logger: Logger;
  limits?: QuotaLimits;
  callTimeoutMs?: number;
  maxAttempts?: number;
  /** Supplies the abort signal, so tests need not wait out the real timeout. */
  timeoutSignal: (ms: number) => AbortSignalLike;
};

type UsageBase = Omit<AIUsageRecord, "outcome" | "createdAtMs">;

type Settled<T> = { kind: "outcome"; outcome: ProviderOutcome<T> };

/**
 * Runs one provider call under the durable ProviderCall protocol: a stored result is reused, an
 * attempt is written before the call, and an unobserved outcome is never silently repeated.
 * Quota stays charged for every attempt and is adjusted only to a provider-reported cost.
 */
export class ProviderCallExecutor {
  private readonly deps: Required<ProviderCallExecutorDeps>;

  constructor(deps: ProviderCallExecutorDeps) {
    this.deps = {
      limits: DEFAULT_QUOTA_LIMITS,
      callTimeoutMs: PIPELINE_TIMEOUTS.callTimeoutMs,
      maxAttempts: PIPELINE_TIMEOUTS.maxAttempts,
      ...deps,
    };
  }

  private action(r: ProviderCallRecord) {
    return nextProviderAction({
      state: isUnattempted(r) ? null : r.state,
      hasResult: hasResult(r),
      retrySafety: r.retrySafety,
      attemptCount: r.attemptCount,
      maxAttempts: this.deps.maxAttempts,
      userApprovedRetry: r.userApprovedRetry,
    });
  }

  async execute<T>(params: ExecuteParams<T>): Promise<ExecuteResult<T>> {
    const { ownerId, sourceEventId, stage, provider } = params;
    const { providerCalls, quota, clock } = this.deps;
    let record = await providerCalls.getOrCreate(
      ownerId,
      { sourceEventId, stage, providerId: provider.id },
      provider.retrySafety,
    );
    // A call still `started` means the previous worker died under this stage.
    if (record.state === "started") {
      const died = record;
      record = await providerCalls.markUnknown(
        ownerId,
        died.id,
        died.attemptCount,
        "workerDied",
        clock.nowMs(),
      );
      if (record.state === "unknown") {
        await this.appendUsage(ownerId, workerDiedUsage(died, clock.nowMs()));
      }
    }
    const action = this.action(record);
    if (action === "reuseResult") return this.reuse(record);
    if (action !== "invoke") return { kind: action };

    let reservationId: string | undefined;
    if (params.estimateMicroUsd > 0) {
      const reserved = await quota.reserve(
        ownerId,
        params.estimateMicroUsd,
        clock.nowMs(),
        this.deps.limits,
      );
      if (reserved.status === "exhausted")
        return { kind: "quotaExhausted", window: reserved.window };
      reservationId = reserved.reservationId;
      this.warn(reserved.warningsCrossed, sourceEventId);
    }

    const approved = record.userApprovedRetry;
    // The attempt is written before the call, so a crash during it is seen as `unknown`.
    record = await providerCalls.beginAttempt(
      ownerId,
      record.id,
      reservationId === undefined ? {} : { reservationId },
      clock.nowMs(),
    );
    const attempt = record.attemptCount;
    const { outcome } = await this.call(record.requestKey, params);

    const usage: UsageBase = {
      id: `${record.id}:${String(attempt)}`,
      providerId: provider.id,
      estimatedMicroUsd: params.estimateMicroUsd,
      userApprovedRetry: approved,
      sourceEventId,
      stage,
      attempt,
    };
    if (outcome.kind === "success") {
      return this.succeed(params, record, outcome, reservationId, usage);
    }
    const code = safeErrorCode(outcome.code);
    record = await this.write(ownerId, usage, () =>
      outcome.kind === "definiteFailure"
        ? providerCalls.markFailed(ownerId, record.id, attempt, code, clock.nowMs())
        : providerCalls.markUnknown(ownerId, record.id, attempt, code, clock.nowMs()),
    );
    await this.appendUsage(ownerId, { ...usage, outcome: outcome.kind, errorCode: code });
    // Re-ask the protocol: a retryable failure waits for recovery, anything else returns as it is.
    const next = this.action(record);
    if (next === "reuseResult") return this.reuse(record);
    if (next === "invoke") return { kind: "retryLater" };
    return { kind: next };
  }

  private reuse<T>(record: ProviderCallRecord): ExecuteResult<T> {
    return {
      kind: "result",
      value: record.result as T,
      retriedAfterUnknown: record.retriedAfterUnknown,
    };
  }

  private warn(windows: readonly string[], sourceEventId: string): void {
    for (const window of windows) this.deps.logger.warn("quotaWarning", { window, sourceEventId });
  }

  /**
   * A failing record write must not lose the attempt from metering: the call stays `started`
   * (treated as unknown later), so the attempt is metered as unknown and the error propagates.
   */
  private async write(
    ownerId: OwnerId,
    usage: UsageBase,
    fn: () => Promise<ProviderCallRecord>,
  ): Promise<ProviderCallRecord> {
    try {
      return await fn();
    } catch (error) {
      await this.appendUsage(ownerId, {
        ...usage,
        outcome: "unknown",
        errorCode: "recordWriteFailed",
      });
      throw error;
    }
  }

  private async succeed<T>(
    params: ExecuteParams<T>,
    record: ProviderCallRecord,
    outcome: Extract<ProviderOutcome<T>, { kind: "success" }>,
    reservationId: string | undefined,
    usage: UsageBase,
  ): Promise<ExecuteResult<T>> {
    const { ownerId } = params;
    const { providerCalls, quota, clock, logger } = this.deps;
    const attempt = record.attemptCount;
    try {
      assertStorableResult(outcome.value);
    } catch (error) {
      // The provider answered but the answer cannot be stored: the outcome is not usable, and
      // the call may have been charged, so it is recorded unknown and never repeated silently.
      await this.write(ownerId, usage, () =>
        providerCalls.markUnknown(ownerId, record.id, attempt, "resultNotStorable", clock.nowMs()),
      );
      await this.appendUsage(ownerId, {
        ...usage,
        outcome: "unknown",
        errorCode: "resultNotStorable",
      });
      throw error;
    }
    // First success wins: what comes back is what is stored, which may be an older attempt's.
    const stored = await this.write(ownerId, usage, () =>
      providerCalls.markSucceeded(ownerId, record.id, attempt, outcome.value, clock.nowMs()),
    );
    const actual = outcome.actualMicroUsd;
    if (actual !== undefined) {
      // A free provider that reports a cost is still charged: it settles a zero reservation.
      const id =
        reservationId ??
        (actual > 0 ? makeReservationId(0, clock.nowMs(), `charge${String(attempt)}`) : undefined);
      if (id !== undefined) {
        try {
          const settled = await quota.settle(ownerId, id, actual, this.deps.limits);
          this.warn(settled.warningsCrossed, usage.sourceEventId);
        } catch (error) {
          logger.error("quota.settleFailed", {
            sourceEventId: usage.sourceEventId,
            errorName: error instanceof Error ? error.name : "unknown",
          });
        }
      }
    }
    await this.appendUsage(ownerId, {
      ...usage,
      outcome: "success",
      ...(actual !== undefined ? { actualMicroUsd: actual } : {}),
    });
    return this.reuse(stored);
  }

  /** Any thrown error or abort is `unknown`: the provider may have processed the request. */
  private async call<T>(requestKey: string, params: ExecuteParams<T>): Promise<Settled<T>> {
    const signal = this.deps.timeoutSignal(this.deps.callTimeoutMs);
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      const fail = (): void => {
        reject(new Error("provider call timed out"));
      };
      if (signal.aborted) fail();
      else {
        onAbort = fail;
        signal.addEventListener("abort", fail, { once: true });
      }
    });
    aborted.catch(() => undefined);
    const started = Promise.resolve().then(() => params.invoke(requestKey, signal));
    started.catch(() => undefined);
    try {
      return { kind: "outcome", outcome: await Promise.race([started, aborted]) };
    } catch (error) {
      this.deps.logger.warn("provider.callFailed", {
        sourceEventId: params.sourceEventId,
        stage: params.stage,
        errorName: error instanceof Error ? error.name : "unknown",
      });
      return {
        kind: "outcome",
        outcome: { kind: "unknown", code: signal.aborted ? "timeout" : "providerError" },
      };
    } finally {
      if (onAbort !== undefined) signal.removeEventListener("abort", onAbort);
    }
  }

  /** Metering is best effort once the call itself is recorded: a failure is logged, never fatal. */
  private async appendUsage(
    ownerId: OwnerId,
    record: Omit<AIUsageRecord, "createdAtMs">,
  ): Promise<void> {
    try {
      await this.deps.usage.append(ownerId, { ...record, createdAtMs: this.deps.clock.nowMs() });
    } catch (error) {
      this.deps.logger.error("aiUsage.appendFailed", {
        sourceEventId: record.sourceEventId,
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
  }
}
