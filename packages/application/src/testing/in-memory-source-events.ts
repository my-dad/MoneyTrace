import type { OwnerCollectionName } from "@moneytrace/contracts";
import {
  DomainError,
  type OwnerId,
  type PipelineStage,
  type SourceEventId,
} from "@moneytrace/domain";
import type { Clock } from "../ports/clock";
import type {
  ClaimResult,
  ExpiredClaim,
  Parking,
  SourceEventInput,
  SourceEventRecord,
  SourceEventRepository,
  StageClaim,
  StageCommit,
} from "../ports/source-event-repository";
import {
  applyCommit,
  assertCommitReasons,
  decideClaim,
  decidePark,
  decideReopen,
  holdsClaim,
  isLeaseExpired,
  newSourceEvent,
  sourceHashRecordId,
  sourceKeyRecordId,
  validateOutputs,
} from "../source-event-guards";

/** Surfaces a synchronous throw as a rejection, like an async adapter does. */
function attempt<T>(fn: () => T): Promise<T> {
  try {
    return Promise.resolve(fn());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error("unknown failure"));
  }
}

type OwnerData = {
  events: Map<string, SourceEventRecord>;
  /** Idempotency record ID to the source event and the hash it was created for. */
  records: Map<string, { sourceEventId: SourceEventId; sourceHash: string }>;
  outputs: Map<string, Record<string, unknown>>;
};

/** Single-threaded, so every method is atomic by construction. Mirrors the Firestore adapter. */
export class InMemorySourceEvents implements SourceEventRepository {
  private readonly owners = new Map<string, OwnerData>();
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  private data(ownerId: OwnerId): OwnerData {
    let d = this.owners.get(ownerId);
    if (d === undefined) {
      d = { events: new Map(), records: new Map(), outputs: new Map() };
      this.owners.set(ownerId, d);
    }
    return d;
  }

  create(
    ownerId: OwnerId,
    input: SourceEventInput,
  ): Promise<{ status: "created" | "duplicate"; sourceEventId: SourceEventId }> {
    return attempt(() => this.createNow(ownerId, input));
  }

  private createNow(
    ownerId: OwnerId,
    input: SourceEventInput,
  ): { status: "created" | "duplicate"; sourceEventId: SourceEventId } {
    const d = this.data(ownerId);
    const byKey = d.records.get(sourceKeyRecordId(input.idempotencyKey));
    if (byKey !== undefined) {
      if (byKey.sourceHash !== input.sourceHash) {
        throw new DomainError(
          "invalidIntent",
          "idempotency key reused with a different source hash",
        );
      }
      return { status: "duplicate", sourceEventId: byKey.sourceEventId };
    }
    const byHash = d.records.get(sourceHashRecordId(input.sourceHash));
    if (byHash !== undefined) {
      return { status: "duplicate", sourceEventId: byHash.sourceEventId };
    }
    const stored = { sourceEventId: input.sourceEventId, sourceHash: input.sourceHash };
    d.records.set(sourceKeyRecordId(input.idempotencyKey), stored);
    d.records.set(sourceHashRecordId(input.sourceHash), stored);
    d.events.set(input.sourceEventId, newSourceEvent(input));
    return { status: "created", sourceEventId: input.sourceEventId };
  }

  get(ownerId: OwnerId, id: SourceEventId): Promise<SourceEventRecord | null> {
    const e = this.data(ownerId).events.get(id);
    return Promise.resolve(e === undefined ? null : { ...e });
  }

  claim(
    ownerId: OwnerId,
    id: SourceEventId,
    stage: PipelineStage,
    workerId: string,
    nowMs: number,
  ): Promise<ClaimResult> {
    const d = this.data(ownerId);
    const decision = decideClaim(d.events.get(id) ?? null, stage, workerId, nowMs);
    if (!decision.ok) return Promise.resolve(decision.result);
    d.events.set(id, decision.event);
    return Promise.resolve({ status: "claimed", claim: decision.claim });
  }

  commitStage(
    ownerId: OwnerId,
    claim: StageClaim,
    commit: StageCommit,
  ): Promise<"committed" | "staleClaim"> {
    return attempt(() => this.commitNow(ownerId, claim, commit));
  }

  private commitNow(
    ownerId: OwnerId,
    claim: StageClaim,
    commit: StageCommit,
  ): "committed" | "staleClaim" {
    assertCommitReasons(commit);
    const outputs = validateOutputs(commit.outputs);
    const d = this.data(ownerId);
    const event = d.events.get(claim.sourceEventId) ?? null;
    if (event === null || !holdsClaim(event, claim)) return "staleClaim";
    for (const o of outputs) d.outputs.set(`${o.collection}/${o.docId}`, { ...o.data });
    d.events.set(event.id, applyCommit(event, commit, this.clock.nowMs()));
    return "committed";
  }

  listExpiredClaims(nowMs: number, limit: number): Promise<ExpiredClaim[]> {
    const rows: { row: ExpiredClaim; leaseExpiresAtMs: number }[] = [];
    for (const [ownerId, d] of this.owners) {
      for (const e of d.events.values()) {
        if (e.claim === null || !isLeaseExpired(e.claim.leaseExpiresAtMs, nowMs)) continue;
        rows.push({
          row: {
            ownerId: ownerId as OwnerId,
            sourceEventId: e.id,
            stage: e.claim.stage,
            version: e.version,
            stageAttempt: e.stageAttempt,
          },
          leaseExpiresAtMs: e.claim.leaseExpiresAtMs,
        });
      }
    }
    rows.sort((a, b) => a.leaseExpiresAtMs - b.leaseExpiresAtMs);
    return Promise.resolve(rows.slice(0, limit).map((r) => r.row));
  }

  reopen(
    ownerId: OwnerId,
    id: SourceEventId,
    expectedVersion: number,
    nowMs: number,
  ): Promise<"reopened" | "stale"> {
    const d = this.data(ownerId);
    const next = decideReopen(d.events.get(id) ?? null, expectedVersion, nowMs);
    if (next === null) return Promise.resolve("stale");
    d.events.set(id, next);
    return Promise.resolve("reopened");
  }

  park(
    ownerId: OwnerId,
    id: SourceEventId,
    expectedVersion: number,
    parking: Parking,
    nowMs: number,
  ): Promise<"parked" | "stale"> {
    const d = this.data(ownerId);
    const next = decidePark(d.events.get(id) ?? null, expectedVersion, parking, nowMs);
    if (next === null) return Promise.resolve("stale");
    d.events.set(id, next);
    return Promise.resolve("parked");
  }

  /** Test access to what stage outputs wrote. */
  outputsOf(ownerId: OwnerId, collection: OwnerCollectionName): Record<string, unknown>[] {
    const prefix = `${collection}/`;
    return [...this.data(ownerId).outputs]
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => ({ ...v }));
  }
}
