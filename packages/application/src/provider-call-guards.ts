import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import { DomainError, asSourceEventId, type RetrySafety } from "@moneytrace/domain";
import type { ProviderCallKey, ProviderCallRecord } from "./ports/provider-call-repository";

const invalid = (message: string): DomainError => new DomainError("invalidIntent", message);

const DOC_ID = /^[A-Za-z0-9_:.-]{1,128}$/;
const PROVIDER_ID = /^[A-Za-z0-9_.-]{1,64}$/;
const ERROR_CODE = /^[A-Za-z0-9_.-]{1,64}$/;
const MAX_RESULT_CHARS = 500_000;
const MAX_DEPTH = 16;

/**
 * Deterministic ID and request key for `(sourceEventId, stage, providerId)`. Neither the event ID
 * nor the provider ID may contain `:`, so two different keys can never produce one ID.
 */
export function providerCallId(key: ProviderCallKey): string {
  if (!DOC_ID.test(key.sourceEventId) || key.sourceEventId.includes(":")) {
    throw invalid("invalid provider call source event ID");
  }
  if (!PROVIDER_ID.test(key.providerId)) throw invalid("invalid provider ID");
  const id = `${key.sourceEventId}:${key.stage}:${key.providerId}`;
  if (!DOC_ID.test(id)) throw new DomainError("invalidId", "provider call ID is too long");
  return id;
}

export function assertErrorCode(code: string): void {
  if (!ERROR_CODE.test(code)) throw invalid("invalid provider error code");
}

export function newProviderCall(
  key: ProviderCallKey,
  retrySafety: RetrySafety,
  nowMs: number,
): ProviderCallRecord {
  const id = providerCallId(key);
  // Nothing attempted yet: `failed` with no attempts is read as "no state" (see isUnattempted).
  return {
    id,
    sourceEventId: key.sourceEventId,
    stage: key.stage,
    providerId: key.providerId,
    retrySafety,
    state: "failed",
    requestKey: id,
    attemptCount: 0,
    userApprovedRetry: false,
    retriedAfterUnknown: false,
    updatedAtMs: nowMs,
  };
}

/** A declared safety that differs from the stored one is a configuration bug: never guess. */
export function assertSameSafety(record: ProviderCallRecord, requested: RetrySafety): void {
  if (record.retrySafety !== requested) {
    throw invalid("the provider's declared retry safety changed since the call was created");
  }
}

export const hasResult = (r: ProviderCallRecord): boolean => r.result !== undefined;

/** Created but never attempted: `nextProviderAction` sees it as having no state. */
export const isUnattempted = (r: ProviderCallRecord): boolean =>
  r.state === "failed" && r.attemptCount === 0;

/** The outcome is not known to be usable: only an approved retry may call the provider again. */
export const isUnresolved = (r: ProviderCallRecord): boolean =>
  r.state === "started" ||
  r.state === "unknown" ||
  r.state === "purged" ||
  (r.state === "succeeded" && !hasResult(r));

export function decideApprove(r: ProviderCallRecord, nowMs: number): ProviderCallRecord | null {
  if (!isUnresolved(r)) return null;
  return { ...r, userApprovedRetry: true, updatedAtMs: nowMs };
}

export function decideBegin(
  r: ProviderCallRecord,
  reservationId: string | undefined,
  nowMs: number,
): ProviderCallRecord {
  if (r.state === "started") throw invalid("a provider call is already in flight");
  if (r.state === "succeeded" && hasResult(r))
    throw invalid("the provider call already has a result");
  if (reservationId !== undefined && !DOC_ID.test(reservationId)) {
    throw invalid("invalid quota reservation ID");
  }
  const next: ProviderCallRecord = {
    ...r,
    state: "started",
    attemptCount: r.attemptCount + 1,
    userApprovedRetry: false,
    retriedAfterUnknown: r.retriedAfterUnknown || r.userApprovedRetry,
    updatedAtMs: nowMs,
  };
  // The reservation belongs to one attempt: the previous one is dropped, not carried over.
  delete next.quotaReservationId;
  return reservationId === undefined ? next : { ...next, quotaReservationId: reservationId };
}

/** Throws `invalidIntent` unless `value` is plain JSON that Firestore can store as it is. */
export function assertStorableResult(value: unknown): void {
  const seen = new Set<object>();
  const walk = (v: unknown, depth: number, parentIsArray: boolean): void => {
    if (depth > MAX_DEPTH) throw invalid("provider result is nested too deeply");
    if (v === null || typeof v === "boolean" || typeof v === "string") return;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) throw invalid("provider result holds a non-finite number");
      return;
    }
    if (typeof v !== "object") throw invalid("provider result is not JSON-serializable");
    if (seen.has(v)) throw invalid("provider result is cyclic or shares a reference");
    seen.add(v);
    if (Array.isArray(v)) {
      if (parentIsArray) throw invalid("provider result holds a nested array");
      for (const item of v) walk(item, depth + 1, true);
    } else {
      const proto: unknown = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) {
        throw invalid("provider result holds a non-plain object");
      }
      for (const [k, item] of Object.entries(v)) {
        if (k.length === 0 || /^__.*__$/.test(k))
          throw invalid("provider result holds a reserved key");
        walk(item, depth + 1, false);
      }
    }
    seen.delete(v);
  };
  walk(value, 0, false);
  if (JSON.stringify(value).length > MAX_RESULT_CHARS)
    throw invalid("provider result is too large");
}

/** A deep copy through JSON, so stored data never aliases the caller's. */
export const cloneJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;

/** Returns `null` when the write changes nothing (a repeat, or a late worker that lost). */
export function decideSucceeded(
  r: ProviderCallRecord,
  result: unknown,
  nowMs: number,
): ProviderCallRecord | null {
  assertStorableResult(result);
  if (r.state === "succeeded" && hasResult(r)) return null;
  if (r.state !== "started" && r.state !== "unknown") {
    throw invalid(`a provider call in state ${r.state} cannot record a result`);
  }
  return { ...r, state: "succeeded", result: cloneJson(result), updatedAtMs: nowMs };
}

export function decideFailed(
  r: ProviderCallRecord,
  code: string,
  nowMs: number,
): ProviderCallRecord | null {
  assertErrorCode(code);
  return r.state === "started" ? { ...r, state: "failed", updatedAtMs: nowMs } : null;
}

export function decideUnknown(
  r: ProviderCallRecord,
  code: string,
  nowMs: number,
): ProviderCallRecord | null {
  assertErrorCode(code);
  return r.state === "started" ? { ...r, state: "unknown", updatedAtMs: nowMs } : null;
}

/** Only a stored result is purged; other states carry nothing to clear and keep their meaning. */
export function decidePurgeResult(r: ProviderCallRecord, nowMs: number): ProviderCallRecord | null {
  if (r.state !== "succeeded") return null;
  const next: ProviderCallRecord = { ...r, state: "purged", updatedAtMs: nowMs };
  delete next.result;
  return next;
}

/** Optional fields are written only when present: Firestore rejects `undefined`. */
export function providerCallToDoc(r: ProviderCallRecord): Record<string, unknown> {
  return OWNER_COLLECTIONS.providerCalls.parse({
    id: r.id,
    sourceEventId: r.sourceEventId,
    stage: r.stage,
    providerId: r.providerId,
    retrySafety: r.retrySafety,
    state: r.state,
    requestKey: r.requestKey,
    attemptCount: r.attemptCount,
    userApprovedRetry: r.userApprovedRetry,
    retriedAfterUnknown: r.retriedAfterUnknown,
    ...(r.quotaReservationId !== undefined ? { quotaReservationId: r.quotaReservationId } : {}),
    ...(r.result !== undefined ? { result: r.result } : {}),
    updatedAtMs: r.updatedAtMs,
  });
}

export function toProviderCallRecord(data: unknown): ProviderCallRecord {
  const d = OWNER_COLLECTIONS.providerCalls.parse(data);
  return {
    id: d.id,
    sourceEventId: asSourceEventId(d.sourceEventId),
    stage: d.stage,
    providerId: d.providerId,
    retrySafety: d.retrySafety,
    state: d.state,
    requestKey: d.requestKey,
    attemptCount: d.attemptCount,
    userApprovedRetry: d.userApprovedRetry,
    retriedAfterUnknown: d.retriedAfterUnknown,
    ...(d.quotaReservationId !== undefined ? { quotaReservationId: d.quotaReservationId } : {}),
    ...(d.result !== undefined ? { result: d.result } : {}),
    updatedAtMs: d.updatedAtMs,
  };
}
