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
  quotaReservationId?: string;
  result?: unknown;
  updatedAtMs: number;
};

export type PurgeCandidate = { ownerId: OwnerId; sourceEventId: SourceEventId };

/**
 * A freshly created record has `state: "failed"` and `attemptCount: 0`: nothing was attempted yet
 * (see `isUnattempted`). Every method is atomic. Mutators return the stored record.
 *
 * Outcome writes are tolerant of late workers: `markSucceeded` is accepted from `started` or
 * `unknown` and never overwrites a stored result; `markFailed` and `markUnknown` only act on
 * `started`. A result that is not plain JSON throws `invalidIntent` and changes nothing.
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
    result: unknown,
    nowMs: number,
  ): Promise<ProviderCallRecord>;
  markFailed(
    ownerId: OwnerId,
    id: string,
    code: string,
    nowMs: number,
  ): Promise<ProviderCallRecord>;
  markUnknown(
    ownerId: OwnerId,
    id: string,
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
