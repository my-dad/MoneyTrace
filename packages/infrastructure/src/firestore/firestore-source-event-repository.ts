import {
  applyCommit,
  assertCommitReasons,
  assertCreateInput,
  decideClaim,
  decideFinishParked,
  decidePark,
  decideReopen,
  decideUserDecision,
  holdsClaim,
  newSourceEvent,
  sourceHashRecordId,
  sourceKeyRecordId,
  validateOutputs,
  type Clock,
  type CreateResult,
  type Logger,
  type ClaimResult,
  type ExpiredClaim,
  type Parking,
  type SourceEventInput,
  type SourceEventRecord,
  type SourceEventRepository,
  type StageClaim,
  type StageCommit,
  type UserDecision,
} from "@moneytrace/application";
import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import {
  DomainError,
  asOwnerId,
  asSourceEventId,
  type OwnerId,
  type PipelineStage,
  type SourceEventId,
} from "@moneytrace/domain";
import type { Firestore, Transaction as FirestoreTransaction } from "firebase-admin/firestore";
import { ownerPath } from "./paths";
import { sourceEventToDoc, toSourceEventRecord } from "./records";

const MAX_ATTEMPTS = 5;
/** gRPC ABORTED: the SDK gave up retrying a contended transaction. */
const ABORTED = 10;

const isAborted = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === ABORTED;

/**
 * Every method is one `runTransaction` that re-reads the event, so the version and claim checks see
 * committed state. The decisions live in `source-event-guards`, shared with `InMemorySourceEvents`.
 * Whole documents are written with `set`, so a cleared claim or reason is never left behind.
 */
export class FirestoreSourceEventRepository implements SourceEventRepository {
  private readonly db: Firestore;
  private readonly clock: Clock;
  private readonly logger: Logger;

  constructor(db: Firestore, clock: Clock, logger: Logger) {
    this.db = db;
    this.clock = clock;
    this.logger = logger;
  }

  private eventRef(ownerId: OwnerId, id: string) {
    return this.db.doc(ownerPath(ownerId, "sourceEvents", id));
  }

  private async read(
    t: FirestoreTransaction,
    ownerId: OwnerId,
    id: string,
  ): Promise<SourceEventRecord | null> {
    const s = await t.get(this.eventRef(ownerId, id));
    return s.exists ? toSourceEventRecord(s.data()) : null;
  }

  async create(ownerId: OwnerId, input: SourceEventInput): Promise<CreateResult> {
    assertCreateInput(input);
    const keyRef = this.db.doc(
      ownerPath(ownerId, "idempotencyRecords", sourceKeyRecordId(input.idempotencyKey)),
    );
    const hashRef = this.db.doc(
      ownerPath(ownerId, "idempotencyRecords", sourceHashRecordId(input.sourceHash)),
    );
    const eventRef = this.eventRef(ownerId, input.sourceEventId);
    return this.db.runTransaction(
      async (t) => {
        const [byKey, byHash, existing] = await Promise.all([
          t.get(keyRef),
          t.get(hashRef),
          t.get(eventRef),
        ]);
        if (byKey.exists) {
          const seen = OWNER_COLLECTIONS.idempotencyRecords.parse(byKey.data());
          if (seen.payloadHash !== input.sourceHash)
            return { status: "idempotencyConflict" as const };
          return duplicateOf(seen.sourceEventId);
        }
        if (byHash.exists) {
          return duplicateOf(
            OWNER_COLLECTIONS.idempotencyRecords.parse(byHash.data()).sourceEventId,
          );
        }
        if (existing.exists) {
          throw new DomainError("invalidIntent", "a source event with that ID already exists");
        }
        const record = (key: string) =>
          OWNER_COLLECTIONS.idempotencyRecords.parse({
            key,
            payloadHash: input.sourceHash,
            sourceEventId: input.sourceEventId,
            createdAtMs: this.clock.nowMs(),
          });
        t.set(eventRef, sourceEventToDoc(newSourceEvent(input)));
        t.set(keyRef, record(sourceKeyRecordId(input.idempotencyKey)));
        t.set(hashRef, record(sourceHashRecordId(input.sourceHash)));
        return { status: "created" as const, sourceEventId: input.sourceEventId };
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }

  async get(ownerId: OwnerId, id: SourceEventId): Promise<SourceEventRecord | null> {
    const s = await this.eventRef(ownerId, id).get();
    return s.exists ? toSourceEventRecord(s.data()) : null;
  }

  /**
   * Losing a race is not an error. A transaction that keeps aborting under contention is reported
   * as a live claim: whoever kept winning holds it.
   */
  async claim(
    ownerId: OwnerId,
    id: SourceEventId,
    stage: PipelineStage,
    workerId: string,
    nowMs: number,
  ): Promise<ClaimResult> {
    try {
      return await this.db.runTransaction(
        async (t): Promise<ClaimResult> => {
          const decision = decideClaim(await this.read(t, ownerId, id), stage, workerId, nowMs);
          if (!decision.ok) return decision.result;
          t.set(this.eventRef(ownerId, id), sourceEventToDoc(decision.event));
          return { status: "claimed", claim: decision.claim };
        },
        { maxAttempts: MAX_ATTEMPTS },
      );
    } catch (error) {
      if (isAborted(error)) return { status: "notClaimable", reason: "liveClaim" };
      throw error;
    }
  }

  /** An `ABORTED` here is not masked: the caller must know the commit did not happen. */
  async commitStage(
    ownerId: OwnerId,
    claim: StageClaim,
    commit: StageCommit,
  ): Promise<"committed" | "staleClaim"> {
    assertCommitReasons(commit);
    const outputs = validateOutputs(commit.outputs, claim.sourceEventId, claim.stage);
    return this.db.runTransaction(
      async (t) => {
        const event = await this.read(t, ownerId, claim.sourceEventId);
        if (event === null || !holdsClaim(event, claim)) return "staleClaim" as const;
        // Create-if-absent: all reads precede the writes, and an existing output is kept.
        const refs = outputs.map((o) => this.db.doc(ownerPath(ownerId, o.collection, o.docId)));
        const existing = refs.length === 0 ? [] : await t.getAll(...refs);
        outputs.forEach((o, i) => {
          if (!existing[i]?.exists) t.set(refs[i] as (typeof refs)[number], o.data);
        });
        t.set(
          this.eventRef(ownerId, event.id),
          sourceEventToDoc(applyCommit(event, commit, this.clock.nowMs())),
        );
        return "committed" as const;
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }

  /** One range filter on the overridden field, ordered by it: no composite index is needed. */
  async listExpiredClaims(nowMs: number, limit: number): Promise<ExpiredClaim[]> {
    const snap = await this.db
      .collectionGroup("sourceEvents")
      .where("claim.leaseExpiresAtMs", "<=", nowMs)
      .orderBy("claim.leaseExpiresAtMs")
      .limit(limit)
      .get();
    const rows: ExpiredClaim[] = [];
    for (const doc of snap.docs) {
      const owner = doc.ref.parent.parent;
      if (owner?.parent.id !== "users") continue;
      let e: SourceEventRecord;
      try {
        e = toSourceEventRecord(doc.data());
      } catch (error) {
        // One bad document must not stop recovery of the others.
        this.logger.warn("pipeline.malformedSourceEvent", {
          sourceEventId: doc.id,
          errorName: error instanceof Error ? error.name : "unknown",
        });
        continue;
      }
      if (e.claim === null) continue;
      rows.push({
        ownerId: asOwnerId(owner.id),
        sourceEventId: asSourceEventId(e.id),
        stage: e.claim.stage,
        version: e.version,
        stageAttempt: e.stageAttempt,
      });
    }
    return rows;
  }

  reopen(
    ownerId: OwnerId,
    id: SourceEventId,
    expectedVersion: number,
    nowMs: number,
  ): Promise<"reopened" | "stale"> {
    return this.transition(ownerId, id, "reopened", (e) => decideReopen(e, expectedVersion, nowMs));
  }

  park(
    ownerId: OwnerId,
    id: SourceEventId,
    expectedVersion: number,
    parking: Parking,
    nowMs: number,
  ): Promise<"parked" | "stale"> {
    return this.transition(ownerId, id, "parked", (e) =>
      decidePark(e, expectedVersion, parking, nowMs),
    );
  }

  finishParked(
    ownerId: OwnerId,
    id: SourceEventId,
    status: "rejected" | "linkedAsDuplicate" | "cancelled",
    nowMs: number,
  ): Promise<"finished" | "stale"> {
    return this.transition(ownerId, id, "finished", (e) => decideFinishParked(e, status, nowMs));
  }

  applyUserDecision(
    ownerId: OwnerId,
    id: SourceEventId,
    decision: UserDecision,
  ): Promise<"applied" | "stale"> {
    return this.transition(ownerId, id, "applied", (e) => decideUserDecision(e, decision));
  }

  private transition<R extends string>(
    ownerId: OwnerId,
    id: SourceEventId,
    done: R,
    decide: (e: SourceEventRecord | null) => SourceEventRecord | null,
  ): Promise<R | "stale"> {
    return this.db.runTransaction(
      async (t) => {
        const next = decide(await this.read(t, ownerId, id));
        if (next === null) return "stale" as const;
        t.set(this.eventRef(ownerId, id), sourceEventToDoc(next));
        return done;
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }
}

function duplicateOf(sourceEventId: string | undefined): {
  status: "duplicate";
  sourceEventId: SourceEventId;
} {
  if (sourceEventId === undefined) {
    throw new Error("source idempotency record has no source event id");
  }
  return { status: "duplicate", sourceEventId: asSourceEventId(sourceEventId) };
}
