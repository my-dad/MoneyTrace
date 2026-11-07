import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import {
  DomainError,
  STAGE_INPUT_STATUS,
  isTerminal,
  type PipelineStage,
} from "@moneytrace/domain";
import type {
  ClaimResult,
  Parking,
  SourceEventInput,
  SourceEventRecord,
  StageClaim,
  StageCommit,
  StageOutput,
} from "./ports/source-event-repository";
import { PIPELINE_TIMEOUTS } from "./pipeline/timeouts";

/** Idempotency record IDs for source events; the ledger uses `ledger:<key>` in the same collection. */
export const sourceKeyRecordId = (idempotencyKey: string): string => `source:${idempotencyKey}`;
export const sourceHashRecordId = (sourceHash: string): string => `hash:${sourceHash}`;

/** Deterministic output ID, so a duplicate worker overwrites its own output rather than adding one. */
export function stageOutputId(sourceEventId: string, stage: PipelineStage, kind: string): string {
  return `${sourceEventId}:${stage}:${kind}`;
}

export const isLeaseExpired = (leaseExpiresAtMs: number, nowMs: number): boolean =>
  leaseExpiresAtMs <= nowMs;

export function newSourceEvent(input: SourceEventInput): SourceEventRecord {
  return {
    id: input.sourceEventId,
    sourceType: input.sourceType,
    sourceHash: input.sourceHash,
    idempotencyKey: input.idempotencyKey,
    status: "received",
    stageAttempt: 0,
    claim: null,
    parkedStage: null,
    version: 0,
    receivedAtMs: input.receivedAtMs,
    terminalAtMs: null,
    providerResultsPurged: false,
  };
}

export type ClaimDecision =
  | { ok: true; event: SourceEventRecord; claim: StageClaim }
  | { ok: false; result: Extract<ClaimResult, { status: "notClaimable" }> };

const invalid = (message: string): DomainError => new DomainError("invalidIntent", message);

export function assertWorkerId(workerId: string): void {
  if (workerId.length < 1 || workerId.length > 128) throw invalid("invalid worker id");
}

const DOC_ID = /^[A-Za-z0-9_:.-]{1,128}$/;

/** The same limits as the stored schema, so a bad input fails identically in every adapter. */
export function assertCreateInput(input: SourceEventInput): void {
  const safe = (v: string): boolean => DOC_ID.test(v) && v !== "." && v !== "..";
  if (!safe(input.idempotencyKey)) throw invalid("invalid idempotency key");
  if (!safe(input.sourceHash)) throw invalid("invalid source hash");
}

export function decideClaim(
  event: SourceEventRecord | null,
  stage: PipelineStage,
  workerId: string,
  nowMs: number,
): ClaimDecision {
  assertWorkerId(workerId);
  if (event === null) return { ok: false, result: { status: "notClaimable", reason: "notFound" } };
  if (event.status !== STAGE_INPUT_STATUS[stage]) {
    return { ok: false, result: { status: "notClaimable", reason: "wrongStatus" } };
  }
  // Any held claim blocks, expired or not: only `reopen` clears one, and it bumps stageAttempt,
  // so the attempt bound cannot be bypassed by redelivered triggers taking over a crashed stage.
  if (event.claim !== null) {
    return { ok: false, result: { status: "notClaimable", reason: "liveClaim" } };
  }
  const leaseExpiresAtMs = nowMs + PIPELINE_TIMEOUTS.leaseMs;
  const version = event.version + 1;
  return {
    ok: true,
    event: { ...event, claim: { workerId, stage, leaseExpiresAtMs }, version },
    claim: {
      sourceEventId: event.id,
      stage,
      workerId,
      version,
      stageAttempt: event.stageAttempt,
      leaseExpiresAtMs,
    },
  };
}

/** The claim is current only if the stored version, worker and stage are still the claimed ones. */
export function holdsClaim(event: SourceEventRecord | null, claim: StageClaim): boolean {
  return (
    event !== null &&
    event.version === claim.version &&
    event.claim !== null &&
    event.claim.workerId === claim.workerId &&
    event.claim.stage === claim.stage
  );
}

/** The event without its claim and reasons, which every transition rewrites. */
function withoutClaimAndReasons(e: SourceEventRecord): SourceEventRecord {
  return {
    id: e.id,
    sourceType: e.sourceType,
    sourceHash: e.sourceHash,
    idempotencyKey: e.idempotencyKey,
    status: e.status,
    stageAttempt: e.stageAttempt,
    claim: null,
    parkedStage: e.parkedStage,
    version: e.version,
    receivedAtMs: e.receivedAtMs,
    terminalAtMs: e.terminalAtMs,
    providerResultsPurged: e.providerResultsPurged,
  };
}

/** A commit into `pending` or `deadLetter` parks the stage, so a later reopen knows where to resume. */
export function applyCommit(
  event: SourceEventRecord,
  commit: StageCommit,
  nowMs: number,
): SourceEventRecord {
  const parks = commit.nextStatus === "pending" || commit.nextStatus === "deadLetter";
  return {
    ...withoutClaimAndReasons(event),
    status: commit.nextStatus,
    ...(commit.pendingReason !== undefined ? { pendingReason: commit.pendingReason } : {}),
    ...(commit.deadLetterReason !== undefined ? { deadLetterReason: commit.deadLetterReason } : {}),
    // stageAttempt is per stage: kept while parked, reset when the event advances.
    stageAttempt: parks ? event.stageAttempt : 0,
    parkedStage: parks ? (event.claim?.stage ?? null) : null,
    version: event.version + 1,
    terminalAtMs: isTerminal(commit.nextStatus) ? nowMs : null,
  };
}

/** Stage outputs are evidence-side records only; the ledger is written solely by LedgerWriter. */
const OUTPUT_COLLECTIONS: ReadonlySet<string> = new Set([
  "followUps",
  "decisionRecords",
  "conversationMessages",
  "aiUsage",
]);

const isSafeDocId = (id: string): boolean =>
  DOC_ID.test(id) && id !== "." && id !== ".." && !/^__.*__$/.test(id);

/** Outputs are validated here, once, for every adapter. Returns the parsed documents. */
export function validateOutputs(
  outputs: readonly StageOutput[],
  sourceEventId: string,
  stage: PipelineStage,
): { collection: StageOutput["collection"]; docId: string; data: Record<string, unknown> }[] {
  const seen = new Set<string>();
  const prefix = `${sourceEventId}:${stage}:`;
  return outputs.map((o) => {
    if (!OUTPUT_COLLECTIONS.has(o.collection)) {
      throw invalid("a stage output may not target that collection");
    }
    if (!isSafeDocId(o.docId)) throw new DomainError("invalidId", "invalid stage output doc ID");
    if (!o.docId.startsWith(prefix) || o.docId.length === prefix.length) {
      throw invalid("a stage output doc ID must start with its event and stage");
    }
    const id = `${o.collection}/${o.docId}`;
    if (seen.has(id)) throw invalid("duplicate stage output document");
    seen.add(id);
    const data = OWNER_COLLECTIONS[o.collection].parse(o.data) as Record<string, unknown>;
    return { collection: o.collection, docId: o.docId, data };
  });
}

/** Checks a commit's shape before any read: reasons must match the next status. */
export function assertCommitReasons(commit: StageCommit): void {
  if (commit.nextStatus !== "pending" && commit.pendingReason !== undefined) {
    throw new DomainError("invalidIntent", "pendingReason requires status pending");
  }
  if (commit.nextStatus !== "deadLetter" && commit.deadLetterReason !== undefined) {
    throw new DomainError("invalidIntent", "deadLetterReason requires status deadLetter");
  }
  if (commit.nextStatus === "pending" && commit.pendingReason === undefined) {
    throw new DomainError("invalidIntent", "status pending requires a pendingReason");
  }
  if (commit.nextStatus === "deadLetter" && commit.deadLetterReason === undefined) {
    throw new DomainError("invalidIntent", "status deadLetter requires a deadLetterReason");
  }
}

/** Reopen or park is refused while a claim is live: the worker may still commit. */
const hasLiveClaim = (e: SourceEventRecord, nowMs: number): boolean =>
  e.claim !== null && !isLeaseExpired(e.claim.leaseExpiresAtMs, nowMs);

export function decideReopen(
  event: SourceEventRecord | null,
  expectedVersion: number,
  nowMs: number,
): SourceEventRecord | null {
  if (event === null || event.version !== expectedVersion || hasLiveClaim(event, nowMs)) {
    return null;
  }
  if (isTerminal(event.status)) return null;
  const stage: PipelineStage | null = event.claim?.stage ?? event.parkedStage;
  if (stage === null) return null;
  return {
    ...withoutClaimAndReasons(event),
    status: STAGE_INPUT_STATUS[stage],
    stageAttempt: event.stageAttempt + 1,
    parkedStage: null,
    version: event.version + 1,
    terminalAtMs: null,
  };
}

export function decidePark(
  event: SourceEventRecord | null,
  expectedVersion: number,
  parking: Parking,
  nowMs: number,
): SourceEventRecord | null {
  if (event === null || event.version !== expectedVersion || hasLiveClaim(event, nowMs)) {
    return null;
  }
  const stage: PipelineStage | null = event.claim?.stage ?? null;
  if (stage === null) return null;
  return {
    ...withoutClaimAndReasons(event),
    status: parking.status,
    ...(parking.status === "pending"
      ? { pendingReason: parking.reason }
      : { deadLetterReason: parking.reason }),
    parkedStage: stage,
    version: event.version + 1,
    terminalAtMs: null,
  };
}
