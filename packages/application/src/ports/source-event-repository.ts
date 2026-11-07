import type { OwnerCollectionName } from "@moneytrace/contracts";
import type {
  DeadLetterReason,
  OwnerId,
  PendingReason,
  PipelineStage,
  SourceEventId,
  SourceEventStatus,
} from "@moneytrace/domain";

export type SourceType = "sms" | "receipt" | "chat" | "csvImport";

export type ClaimState = { workerId: string; stage: PipelineStage; leaseExpiresAtMs: number };

/** Mirrors the `sourceEvents` document schema. */
export type SourceEventRecord = {
  id: SourceEventId;
  sourceType: SourceType;
  sourceHash: string;
  idempotencyKey: string;
  status: SourceEventStatus;
  pendingReason?: PendingReason;
  deadLetterReason?: DeadLetterReason;
  stageAttempt: number;
  claim: ClaimState | null;
  parkedStage: PipelineStage | null;
  version: number;
  receivedAtMs: number;
  terminalAtMs: number | null;
  providerResultsPurged: boolean;
};

export type SourceEventInput = {
  sourceEventId: SourceEventId;
  sourceType: SourceType;
  sourceHash: string;
  idempotencyKey: string;
  receivedAtMs: number;
};

export type StageClaim = {
  sourceEventId: SourceEventId;
  stage: PipelineStage;
  workerId: string;
  /** The event version this claim wrote. A commit, reopen or park must still see it. */
  version: number;
  stageAttempt: number;
  leaseExpiresAtMs: number;
};

export type StageOutput = {
  collection: OwnerCollectionName;
  docId: string;
  data: Record<string, unknown>;
};

export type StageCommit = {
  nextStatus: SourceEventStatus;
  pendingReason?: PendingReason;
  deadLetterReason?: DeadLetterReason;
  outputs: readonly StageOutput[];
};

export type Parking =
  { status: "pending"; reason: PendingReason } | { status: "deadLetter"; reason: DeadLetterReason };

export type ExpiredClaim = {
  ownerId: OwnerId;
  sourceEventId: SourceEventId;
  stage: PipelineStage;
  version: number;
  stageAttempt: number;
};

export type CreateResult =
  | { status: "created" | "duplicate"; sourceEventId: SourceEventId }
  | { status: "idempotencyConflict" };

export type ClaimResult =
  | { status: "claimed"; claim: StageClaim }
  | { status: "notClaimable"; reason: "wrongStatus" | "liveClaim" | "notFound" };

/**
 * Claim rules: `claim` refuses while the event holds any claim, expired or not. Only `reopen`
 * clears a claim, and only once it has expired. Workers that cannot finish commit into `pending`
 * or `deadLetter` through `commitStage`; `park` is for the recovery job alone.
 *
 * Every method is atomic. A lease is expired when `leaseExpiresAtMs <= nowMs`, in every method.
 */
export type SourceEventRepository = {
  /**
   * `idempotencyConflict`: the key was used before with a different source hash. An input whose
   * event ID already exists under a different key and hash throws `invalidIntent`; an existing
   * event is never reset.
   */
  create(ownerId: OwnerId, input: SourceEventInput): Promise<CreateResult>;
  get(ownerId: OwnerId, id: SourceEventId): Promise<SourceEventRecord | null>;
  claim(
    ownerId: OwnerId,
    id: SourceEventId,
    stage: PipelineStage,
    workerId: string,
    nowMs: number,
  ): Promise<ClaimResult>;
  commitStage(
    ownerId: OwnerId,
    claim: StageClaim,
    commit: StageCommit,
  ): Promise<"committed" | "staleClaim">;
  /** Expired claims across all owners, oldest lease first. */
  listExpiredClaims(nowMs: number, limit: number): Promise<ExpiredClaim[]>;
  reopen(
    ownerId: OwnerId,
    id: SourceEventId,
    expectedVersion: number,
    nowMs: number,
  ): Promise<"reopened" | "stale">;
  /** Recovery-only: parks an event whose claim has expired. Workers use `commitStage` instead. */
  park(
    ownerId: OwnerId,
    id: SourceEventId,
    expectedVersion: number,
    parking: Parking,
    nowMs: number,
  ): Promise<"parked" | "stale">;
};
