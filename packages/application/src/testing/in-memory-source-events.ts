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
  CreateResult,
  ExpiredClaim,
  Parking,
  SourceEventInput,
  SourceEventRecord,
  SourceEventRepository,
  StageClaim,
  StageCommit,
  UserDecision,
} from "../ports/source-event-repository";
import {
  applyCommit,
  assertCommitReasons,
  assertCreateInput,
  decideClaim,
  decidePark,
  decideReopen,
  decideUserDecision,
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

  create(ownerId: OwnerId, input: SourceEventInput): Promise<CreateResult> {
    return attempt(() => this.createNow(ownerId, input));
  }

  private createNow(ownerId: OwnerId, input: SourceEventInput): CreateResult {
    assertCreateInput(input);
    const d = this.data(ownerId);
    const byKey = d.records.get(sourceKeyRecordId(input.idempotencyKey));
    if (byKey !== undefined) {
      if (byKey.sourceHash !== input.sourceHash) return { status: "idempotencyConflict" };
      return { status: "duplicate", sourceEventId: byKey.sourceEventId };
    }
    const byHash = d.records.get(sourceHashRecordId(input.sourceHash));
    if (byHash !== undefined) {
      return { status: "duplicate", sourceEventId: byHash.sourceEventId };
    }
    if (d.events.has(input.sourceEventId)) {
      throw new DomainError("invalidIntent", "a source event with that ID already exists");
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
    return attempt(() => {
      const d = this.data(ownerId);
      const decision = decideClaim(d.events.get(id) ?? null, stage, workerId, nowMs);
      if (!decision.ok) return decision.result;
      d.events.set(id, decision.event);
      return { status: "claimed", claim: decision.claim };
    });
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
    const outputs = validateOutputs(commit.outputs, claim.sourceEventId, claim.stage);
    const d = this.data(ownerId);
    const event = d.events.get(claim.sourceEventId) ?? null;
    if (event === null || !holdsClaim(event, claim)) return "staleClaim";
    for (const o of outputs) {
      const key = `${o.collection}/${o.docId}`;
      // Create-if-absent: a retried stage must not overwrite what a user or later stage changed.
      if (!d.outputs.has(key)) d.outputs.set(key, { ...o.data });
    }
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

  applyUserDecision(
    ownerId: OwnerId,
    id: SourceEventId,
    decision: UserDecision,
  ): Promise<"applied" | "stale"> {
    const d = this.data(ownerId);
    const next = decideUserDecision(d.events.get(id) ?? null, decision);
    if (next === null) return Promise.resolve("stale");
    d.events.set(id, next);
    return Promise.resolve("applied");
  }

  /** Synchronous access for sibling fakes that must stay atomic with event state. */
  peek(ownerId: OwnerId, id: string): SourceEventRecord | undefined {
    return this.data(ownerId).events.get(id);
  }

  /** Terminal events that may hold provider results, oldest terminal time first. */
  purgeCandidates(
    terminalAtOrBeforeMs: number,
    limit: number,
  ): { ownerId: OwnerId; sourceEventId: SourceEventId; terminalAtMs: number }[] {
    const rows: { ownerId: OwnerId; sourceEventId: SourceEventId; terminalAtMs: number }[] = [];
    for (const [ownerId, d] of this.owners) {
      for (const e of d.events.values()) {
        if (e.providerResultsPurged || e.terminalAtMs === null) continue;
        if (e.terminalAtMs > terminalAtOrBeforeMs) continue;
        rows.push({
          ownerId: ownerId as OwnerId,
          sourceEventId: e.id,
          terminalAtMs: e.terminalAtMs,
        });
      }
    }
    rows.sort((a, b) => a.terminalAtMs - b.terminalAtMs);
    return rows.slice(0, limit);
  }

  /** Marks an event's provider results purged, as the Firestore adapter does in a transaction. */
  flagResultsPurged(ownerId: OwnerId, id: string): void {
    const d = this.data(ownerId);
    const e = d.events.get(id);
    if (e !== undefined)
      d.events.set(id, { ...e, providerResultsPurged: true, version: e.version + 1 });
  }

  /** Test access to what stage outputs wrote. */
  outputsOf(ownerId: OwnerId, collection: OwnerCollectionName): Record<string, unknown>[] {
    const prefix = `${collection}/`;
    return [...this.data(ownerId).outputs]
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => ({ ...v }));
  }
}
