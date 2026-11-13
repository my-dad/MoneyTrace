import {
  assertSameSafety,
  decideApprove,
  decideBegin,
  decideFailed,
  decidePurgeResult,
  decideSucceeded,
  decideUnknown,
  hasResult,
  newProviderCall,
  providerCallId,
  providerCallToDoc,
  toProviderCallRecord,
  type Clock,
  type ProviderCallKey,
  type ProviderCallRecord,
  type ProviderCallRepository,
  type PurgeCandidate,
} from "@moneytrace/application";
import {
  DomainError,
  asOwnerId,
  asSourceEventId,
  isTerminal,
  type OwnerId,
  type PipelineStage,
  type RetrySafety,
  type SourceEventId,
} from "@moneytrace/domain";
import type { DocStore, DocTransaction } from "../docstore/doc-store";
import { ownerPath } from "./paths";
import { sourceEventToDoc, toSourceEventRecord } from "./records";

const MAX_ATTEMPTS = 5;

/**
 * Every method is one `runTransaction` that re-reads the call, so the state checks see committed
 * state. The decisions live in `provider-call-guards`, shared with `InMemoryProviderCalls`. A
 * transaction that keeps aborting under contention throws: the caller must know it did not happen.
 */
export class FirestoreProviderCallRepository implements ProviderCallRepository {
  private readonly db: DocStore;
  private readonly clock: Clock;

  constructor(db: DocStore, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  private callRef(ownerId: OwnerId, id: string) {
    return this.db.doc(ownerPath(ownerId, "providerCalls", id));
  }

  private eventRef(ownerId: OwnerId, id: string) {
    return this.db.doc(ownerPath(ownerId, "sourceEvents", id));
  }

  private async require(t: DocTransaction, ownerId: OwnerId, id: string): Promise<ProviderCallRecord> {
    const s = await t.get(this.callRef(ownerId, id));
    if (!s.exists) throw new DomainError("invalidIntent", "provider call not found");
    return toProviderCallRecord(s.data());
  }

  /** Reads the call, applies `decide` (null means no change) and writes the whole document. */
  private mutate(
    ownerId: OwnerId,
    id: string,
    decide: (current: ProviderCallRecord) => ProviderCallRecord | null,
  ): Promise<ProviderCallRecord> {
    return this.db.runTransaction(
      async (t) => {
        const current = await this.require(t, ownerId, id);
        const next = decide(current);
        if (next === null) return current;
        t.set(this.callRef(ownerId, id), providerCallToDoc(next));
        return next;
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }

  async getOrCreate(
    ownerId: OwnerId,
    key: ProviderCallKey,
    retrySafety: RetrySafety,
  ): Promise<ProviderCallRecord> {
    const id = providerCallId(key);
    return await this.db.runTransaction(
      async (t) => {
        const ref = this.callRef(ownerId, id);
        const s = await t.get(ref);
        if (s.exists) {
          const existing = toProviderCallRecord(s.data());
          assertSameSafety(existing, retrySafety);
          return existing;
        }
        const created = newProviderCall(key, retrySafety, this.clock.nowMs());
        t.set(ref, providerCallToDoc(created));
        return created;
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }

  async approveRetry(
    ownerId: OwnerId,
    id: string,
    nowMs: number,
  ): Promise<"approved" | "notApplicable"> {
    return this.db.runTransaction(
      async (t) => {
        const next = decideApprove(await this.require(t, ownerId, id), nowMs);
        if (next === null) return "notApplicable" as const;
        t.set(this.callRef(ownerId, id), providerCallToDoc(next));
        return "approved" as const;
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }

  beginAttempt(
    ownerId: OwnerId,
    id: string,
    options: { reservationId?: string },
    nowMs: number,
  ): Promise<ProviderCallRecord> {
    return this.mutate(ownerId, id, (r) => decideBegin(r, options.reservationId, nowMs));
  }

  markSucceeded(
    ownerId: OwnerId,
    id: string,
    attempt: number,
    result: unknown,
    nowMs: number,
  ): Promise<ProviderCallRecord> {
    return this.mutate(ownerId, id, (r) => decideSucceeded(r, attempt, result, nowMs));
  }

  markFailed(
    ownerId: OwnerId,
    id: string,
    attempt: number,
    code: string,
    nowMs: number,
  ): Promise<ProviderCallRecord> {
    return this.mutate(ownerId, id, (r) => decideFailed(r, attempt, code, nowMs));
  }

  markUnknown(
    ownerId: OwnerId,
    id: string,
    attempt: number,
    code: string,
    nowMs: number,
  ): Promise<ProviderCallRecord> {
    return this.mutate(ownerId, id, (r) => decideUnknown(r, attempt, code, nowMs));
  }

  async listForStage(
    ownerId: OwnerId,
    sourceEventId: SourceEventId,
    stage: PipelineStage,
  ): Promise<ProviderCallRecord[]> {
    const snap = await this.db
      .collection(ownerPath(ownerId, "providerCalls"))
      .where("sourceEventId", "==", sourceEventId)
      .where("stage", "==", stage)
      .get();
    return snap.docs
      .map((d) => toProviderCallRecord(d.data()))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  purgeResult(
    ownerId: OwnerId,
    id: string,
    nowMs: number,
  ): Promise<"purged" | "blockedNotTerminal"> {
    return this.db.runTransaction(
      async (t) => {
        const call = await this.require(t, ownerId, id);
        const eventSnap = await t.get(this.eventRef(ownerId, call.sourceEventId));
        // The owning event is re-read here, so a reopen racing this purge cannot lose its result.
        if (!eventSnap.exists || !isTerminal(toSourceEventRecord(eventSnap.data()).status)) {
          return "blockedNotTerminal" as const;
        }
        const next = decidePurgeResult(call, nowMs);
        if (next !== null) t.set(this.callRef(ownerId, id), providerCallToDoc(next));
        return "purged" as const;
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }

  /**
   * Equality on `providerResultsPurged` plus a range on `terminalAtMs` needs the composite index
   * in `firestore.indexes.json`.
   */
  async listPurgeCandidates(
    terminalAtOrBeforeMs: number,
    limit: number,
  ): Promise<PurgeCandidate[]> {
    const snap = await this.db
      .collectionGroup("sourceEvents")
      .where("providerResultsPurged", "==", false)
      .where("terminalAtMs", "<=", terminalAtOrBeforeMs)
      .orderBy("terminalAtMs")
      .limit(limit)
      .get();
    const rows: PurgeCandidate[] = [];
    for (const doc of snap.docs) {
      const owner = doc.ref.parent.parent;
      if (owner?.parent.id !== "users") continue;
      rows.push({ ownerId: asOwnerId(owner.id), sourceEventId: asSourceEventId(doc.id) });
    }
    return rows;
  }

  completeEventPurge(
    ownerId: OwnerId,
    sourceEventId: SourceEventId,
  ): Promise<"done" | "blockedNotTerminal" | "resultsRemain"> {
    return this.db.runTransaction(
      async (t) => {
        const eventSnap = await t.get(this.eventRef(ownerId, sourceEventId));
        if (!eventSnap.exists) return "blockedNotTerminal" as const;
        const event = toSourceEventRecord(eventSnap.data());
        if (!isTerminal(event.status)) return "blockedNotTerminal" as const;
        const calls = await t.get(
          this.db
            .collection(ownerPath(ownerId, "providerCalls"))
            .where("sourceEventId", "==", sourceEventId),
        );
        if (calls.docs.some((d) => hasResult(toProviderCallRecord(d.data())))) {
          return "resultsRemain" as const;
        }
        if (!event.providerResultsPurged) {
          t.set(
            this.eventRef(ownerId, sourceEventId),
            sourceEventToDoc({ ...event, providerResultsPurged: true, version: event.version + 1 }),
          );
        }
        return "done" as const;
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }
}
