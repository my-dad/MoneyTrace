import type {
  OwnerId,
  PipelineStage,
  ProviderCallState,
  RetrySafety,
  SourceEventId,
} from "@moneytrace/domain";

export type ProviderCallKey = {
  sourceEventId: SourceEventId;
  stage: PipelineStage;
  providerId: string;
};

/** Mirrors the `providerCalls` document schema. `result` is minimized JSON-shaped data. */
export type ProviderCallRecord = {
  id: string;
  sourceEventId: string;
  stage: PipelineStage;
  providerId: string;
  retrySafety: RetrySafety;
  state: ProviderCallState;
  requestKey: string;
  attemptCount: number;
  userApprovedRetry: boolean;
  retriedAfterUnknown: boolean;
  /** True when the latest attempt consumed a user approval (`beginAttempt` clears the flag). */
  lastAttemptApproved: boolean;
  quotaReservationId?: string;
  result?: unknown;
  updatedAtMs: number;
};

export type PurgeCandidate = { ownerId: OwnerId; sourceEventId: SourceEventId };

/**
 * A freshly created record has `state: "failed"` and `attemptCount: 0`: nothing was attempted yet
 * (see `isUnattempted`). Every method is atomic. Mutators return the stored record.
 *
 * Outcome writes carry the attempt number they belong to and are fenced by it. `markFailed` and
 * `markUnknown` act only on the `started` attempt with that number, so a late report from an older
 * attempt is a no-op. `markSucceeded` is first-success-wins: it is stored from `started`,
 * `unknown` or `failed` (even while a newer attempt is in flight) and never replaces a stored
 * result; the returned record is what is stored. A result that is not plain JSON, or an attempt
 * that was never started, throws `invalidIntent` and changes nothing.
 */
export type ProviderCallRepository = {
  getOrCreate(
    ownerId: OwnerId,
    key: ProviderCallKey,
    retrySafety: RetrySafety,
  ): Promise<ProviderCallRecord>;
  /** Persists the approval where the call's outcome is unresolved; `notApplicable` otherwise. */
  approveRetry(ownerId: OwnerId, id: string, nowMs: number): Promise<"approved" | "notApplicable">;
  /** Counts the attempt and marks the call started. Consumes a stored approval. */
  beginAttempt(
    ownerId: OwnerId,
    id: string,
    options: { reservationId?: string },
    nowMs: number,
  ): Promise<ProviderCallRecord>;
  markSucceeded(
    ownerId: OwnerId,
    id: string,
    attempt: number,
    result: unknown,
    nowMs: number,
  ): Promise<ProviderCallRecord>;
  markFailed(
    ownerId: OwnerId,
    id: string,
    attempt: number,
    code: string,
    nowMs: number,
  ): Promise<ProviderCallRecord>;
  markUnknown(
    ownerId: OwnerId,
    id: string,
    attempt: number,
    code: string,
    nowMs: number,
  ): Promise<ProviderCallRecord>;
  listForStage(
    ownerId: OwnerId,
    sourceEventId: SourceEventId,
    stage: PipelineStage,
  ): Promise<ProviderCallRecord[]>;
  /** Re-reads the owning event in its transaction: a non-terminal event blocks the purge. */
  purgeResult(
    ownerId: OwnerId,
    id: string,
    nowMs: number,
  ): Promise<"purged" | "blockedNotTerminal">;
  /** Terminal events past `terminalAtOrBeforeMs` that are not yet flagged, oldest first. */
  listPurgeCandidates(terminalAtOrBeforeMs: number, limit: number): Promise<PurgeCandidate[]>;
  /** Flags the event `providerResultsPurged` once it is terminal and no call holds a result. */
  completeEventPurge(
    ownerId: OwnerId,
    sourceEventId: SourceEventId,
  ): Promise<"done" | "blockedNotTerminal" | "resultsRemain">;
};
