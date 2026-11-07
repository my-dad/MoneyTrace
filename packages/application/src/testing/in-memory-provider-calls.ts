import {
  DomainError,
  type OwnerId,
  type PipelineStage,
  type RetrySafety,
  type SourceEventId,
  isTerminal,
} from "@moneytrace/domain";
import type { Clock } from "../ports/clock";
import type {
  ProviderCallKey,
  ProviderCallRecord,
  ProviderCallRepository,
  PurgeCandidate,
} from "../ports/provider-call-repository";
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
} from "../provider-call-guards";
import type { InMemorySourceEvents } from "./in-memory-source-events";

/** Surfaces a synchronous throw as a rejection, like an async adapter does. */
function attempt<T>(fn: () => T): Promise<T> {
  try {
    return Promise.resolve(fn());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error("unknown failure"));
  }
}

/** Single-threaded, so every method is atomic by construction. Mirrors the Firestore adapter. */
export class InMemoryProviderCalls implements ProviderCallRepository {
  private readonly owners = new Map<string, Map<string, ProviderCallRecord>>();
  private readonly events: InMemorySourceEvents;
  private readonly clock: Clock;

  constructor(events: InMemorySourceEvents, clock: Clock) {
    this.events = events;
    this.clock = clock;
  }

  private data(ownerId: OwnerId): Map<string, ProviderCallRecord> {
    let d = this.owners.get(ownerId);
    if (d === undefined) {
      d = new Map();
      this.owners.set(ownerId, d);
    }
    return d;
  }

  private require(ownerId: OwnerId, id: string): ProviderCallRecord {
    const r = this.data(ownerId).get(id);
    if (r === undefined) throw new DomainError("invalidIntent", "provider call not found");
    return r;
  }

  private update(
    ownerId: OwnerId,
    id: string,
    next: ProviderCallRecord | null,
  ): ProviderCallRecord {
    if (next === null) return { ...this.require(ownerId, id) };
    this.data(ownerId).set(id, next);
    return { ...next };
  }

  getOrCreate(
    ownerId: OwnerId,
    key: ProviderCallKey,
    retrySafety: RetrySafety,
  ): Promise<ProviderCallRecord> {
    return attempt(() => {
      const id = providerCallId(key);
      const existing = this.data(ownerId).get(id);
      if (existing !== undefined) {
        assertSameSafety(existing, retrySafety);
        return { ...existing };
      }
      return this.update(ownerId, id, newProviderCall(key, retrySafety, this.clock.nowMs()));
    });
  }

  approveRetry(ownerId: OwnerId, id: string, nowMs: number): Promise<"approved" | "notApplicable"> {
    return attempt(() => {
      const next = decideApprove(this.require(ownerId, id), nowMs);
      if (next === null) return "notApplicable" as const;
      this.update(ownerId, id, next);
      return "approved" as const;
    });
  }

  beginAttempt(
    ownerId: OwnerId,
    id: string,
    options: { reservationId?: string },
    nowMs: number,
  ): Promise<ProviderCallRecord> {
    return attempt(() =>
      this.update(
        ownerId,
        id,
        decideBegin(this.require(ownerId, id), options.reservationId, nowMs),
      ),
    );
  }

  markSucceeded(
    ownerId: OwnerId,
    id: string,
    result: unknown,
    nowMs: number,
  ): Promise<ProviderCallRecord> {
    return attempt(() =>
      this.update(ownerId, id, decideSucceeded(this.require(ownerId, id), result, nowMs)),
    );
  }

  markFailed(
    ownerId: OwnerId,
    id: string,
    code: string,
    nowMs: number,
  ): Promise<ProviderCallRecord> {
    return attempt(() =>
      this.update(ownerId, id, decideFailed(this.require(ownerId, id), code, nowMs)),
    );
  }

  markUnknown(
    ownerId: OwnerId,
    id: string,
    code: string,
    nowMs: number,
  ): Promise<ProviderCallRecord> {
    return attempt(() =>
      this.update(ownerId, id, decideUnknown(this.require(ownerId, id), code, nowMs)),
    );
  }

  listForStage(
    ownerId: OwnerId,
    sourceEventId: SourceEventId,
    stage: PipelineStage,
  ): Promise<ProviderCallRecord[]> {
    return Promise.resolve(
      [...this.data(ownerId).values()]
        .filter((r) => r.sourceEventId === sourceEventId && r.stage === stage)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((r) => ({ ...r })),
    );
  }

  purgeResult(
    ownerId: OwnerId,
    id: string,
    nowMs: number,
  ): Promise<"purged" | "blockedNotTerminal"> {
    return attempt(() => {
      const r = this.require(ownerId, id);
      const event = this.events.peek(ownerId, r.sourceEventId);
      if (event === undefined || !isTerminal(event.status)) return "blockedNotTerminal" as const;
      this.update(ownerId, id, decidePurgeResult(r, nowMs));
      return "purged" as const;
    });
  }

  listPurgeCandidates(terminalAtOrBeforeMs: number, limit: number): Promise<PurgeCandidate[]> {
    return Promise.resolve(
      this.events
        .purgeCandidates(terminalAtOrBeforeMs, limit)
        .map(({ ownerId, sourceEventId }) => ({ ownerId, sourceEventId })),
    );
  }

  completeEventPurge(
    ownerId: OwnerId,
    sourceEventId: SourceEventId,
  ): Promise<"done" | "blockedNotTerminal" | "resultsRemain"> {
    return attempt(() => {
      const event = this.events.peek(ownerId, sourceEventId);
      if (event === undefined || !isTerminal(event.status)) return "blockedNotTerminal" as const;
      const remain = [...this.data(ownerId).values()].some(
        (r) => r.sourceEventId === sourceEventId && hasResult(r),
      );
      if (remain) return "resultsRemain" as const;
      this.events.flagResultsPurged(ownerId, sourceEventId);
      return "done" as const;
    });
  }

  /** Test access: overwrite fields of a stored record, as a corrupted or legacy document would be. */
  seed(ownerId: OwnerId, id: string, patch: Partial<ProviderCallRecord>): void {
    const current = this.require(ownerId, id);
    const next: ProviderCallRecord = { ...current, ...patch };
    if (patch.state === "purged" || (patch.state === "succeeded" && !("result" in patch))) {
      delete next.result;
    }
    this.data(ownerId).set(id, next);
  }

  /** The documents as they would be stored. */
  docsOf(ownerId: string): Record<string, unknown>[] {
    return [...(this.owners.get(ownerId)?.values() ?? [])].map(providerCallToDoc);
  }
}
