import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import { DomainError, asSourceEventId, type RetrySafety } from "@moneytrace/domain";
import type { AIUsageRecord } from "./ports/ai-usage-recorder";
import { parseReservationId } from "./quota-rules";
import type { ProviderCallKey, ProviderCallRecord } from "./ports/provider-call-repository";

const invalid = (message: string): DomainError => new DomainError("invalidIntent", message);

const DOC_ID = /^[A-Za-z0-9_:.-]{1,128}$/;
const PROVIDER_ID = /^[A-Za-z0-9_.-]{1,64}$/;
const ERROR_CODE = /^[A-Za-z0-9_.-]{1,64}$/;
/** Firestore documents are capped at 1 MiB; half of that is left for the result. */
const MAX_RESULT_BYTES = 512 * 1024;
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

/**
 * The one rule for error codes. Digits and separators only is refused, so a phone or account
 * number can never pass for a code on its way into `aiUsage`.
 */
export const isSafeErrorCode = (code: string): boolean =>
  ERROR_CODE.test(code) && !/^[\d._-]+$/.test(code);

export const safeErrorCode = (code: string): string =>
  isSafeErrorCode(code) ? code : "invalidCode";

export function assertErrorCode(code: string): void {
  if (!isSafeErrorCode(code)) throw invalid("invalid provider error code");
}

/** UTF-8 size of a string without `TextEncoder`, which this layer has no types for. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
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
    lastAttemptApproved: false,
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
    lastAttemptApproved: r.userApprovedRetry,
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
  if (utf8Length(JSON.stringify(value)) > MAX_RESULT_BYTES) {
    throw invalid("provider result is too large");
  }
}

/** A deep copy through JSON, so stored data never aliases the caller's. */
export const cloneJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;

const assertAttempt = (r: ProviderCallRecord, attempt: number): void => {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > r.attemptCount) {
    throw invalid("that attempt was never started");
  }
};

/**
 * First success wins. A late success from an older attempt is stored even while a newer attempt
 * is `started`, and a later success never replaces it. Returns `null` when nothing changes.
 */
export function decideSucceeded(
  r: ProviderCallRecord,
  attempt: number,
  result: unknown,
  nowMs: number,
): ProviderCallRecord | null {
  assertStorableResult(result);
  assertAttempt(r, attempt);
  if (r.state === "succeeded" && hasResult(r)) return null;
  if (r.state === "purged" || r.state === "succeeded") {
    throw invalid(`a provider call in state ${r.state} cannot record a result`);
  }
  return {
    ...r,
    state: "succeeded",
    result: cloneJson(result),
    userApprovedRetry: false,
    updatedAtMs: nowMs,
  };
}

/** Only the attempt in flight can record its own failure: an older attempt's report is ignored. */
export function decideFailed(
  r: ProviderCallRecord,
  attempt: number,
  code: string,
  nowMs: number,
): ProviderCallRecord | null {
  assertErrorCode(code);
  return r.state === "started" && r.attemptCount === attempt
    ? { ...r, state: "failed", updatedAtMs: nowMs }
    : null;
}

export function decideUnknown(
  r: ProviderCallRecord,
  attempt: number,
  code: string,
  nowMs: number,
): ProviderCallRecord | null {
  assertErrorCode(code);
  return r.state === "started" && r.attemptCount === attempt
    ? { ...r, state: "unknown", updatedAtMs: nowMs }
    : null;
}

/** The `aiUsage` row for an attempt whose worker died: the estimate comes from its reservation. */
export function workerDiedUsage(r: ProviderCallRecord, nowMs: number): AIUsageRecord {
  let estimatedMicroUsd = 0;
  if (r.quotaReservationId !== undefined) {
    try {
      estimatedMicroUsd = parseReservationId(r.quotaReservationId).estimateMicroUsd;
    } catch {
      estimatedMicroUsd = 0;
    }
  }
  return {
    id: `${r.id}:${String(r.attemptCount)}`,
    providerId: r.providerId,
    estimatedMicroUsd,
    outcome: "unknown",
    errorCode: "workerDied",
    userApprovedRetry: r.lastAttemptApproved,
    sourceEventId: r.sourceEventId,
    stage: r.stage,
    attempt: r.attemptCount,
    createdAtMs: nowMs,
  };
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
    lastAttemptApproved: r.lastAttemptApproved,
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
    lastAttemptApproved: d.lastAttemptApproved ?? false,
    ...(d.quotaReservationId !== undefined ? { quotaReservationId: d.quotaReservationId } : {}),
    ...(d.result !== undefined ? { result: d.result } : {}),
    updatedAtMs: d.updatedAtMs,
  };
}
