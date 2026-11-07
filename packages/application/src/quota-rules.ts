import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import { DomainError } from "@moneytrace/domain";
import type { AIUsageRecord } from "./ports/ai-usage-recorder";
import type { QuotaLimits, QuotaWindow, ReserveResult } from "./ports/quota-ledger";

const invalid = (message: string): DomainError => new DomainError("invalidIntent", message);

/** Bound on every amount, so `x * 100` stays an exact integer. */
const MAX_MICRO_USD = 1_000_000_000_000;
const DAY_MS = 86_400_000;

const isAmount = (n: number): boolean => Number.isSafeInteger(n) && n >= 0 && n <= MAX_MICRO_USD;

/** The stored counter document. The document ID is `window`. */
export type QuotaCounter = {
  window: string;
  reservedMicroUsd: number;
  warnedAtMs: number | null;
  updatedAtMs: number;
};

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

export function utcDayWindow(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export const utcMonthWindow = (ms: number): string => utcDayWindow(ms).slice(0, 7);

export function assertReserveInputs(
  estimateMicroUsd: number,
  nowMs: number,
  limits: QuotaLimits,
): void {
  if (!isAmount(estimateMicroUsd)) throw invalid("invalid quota estimate");
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw invalid("invalid time");
  for (const limit of [limits.perRequestMicroUsd, limits.dailyMicroUsd, limits.monthlyMicroUsd]) {
    if (!isAmount(limit)) throw invalid("invalid quota limit");
  }
}

const emptyCounter = (window: string, nowMs: number): QuotaCounter => ({
  window,
  reservedMicroUsd: 0,
  warnedAtMs: null,
  updatedAtMs: nowMs,
});

/** The first time a window reaches 80% of its limit; `warnedAtMs` makes it fire once. */
const crossesWarning = (c: QuotaCounter, reservedMicroUsd: number, limit: number): boolean =>
  c.warnedAtMs === null && limit > 0 && reservedMicroUsd * 100 >= limit * 80;

export type ReserveDecision =
  | { ok: false; result: Extract<ReserveResult, { status: "exhausted" }> }
  | {
      ok: true;
      daily: QuotaCounter;
      monthly: QuotaCounter;
      warningsCrossed: QuotaWindow[];
    };

/** Pure: the caller stores the two counters atomically, or nothing. */
export function availableIn(
  daily: QuotaCounter | null,
  monthly: QuotaCounter | null,
  limits: QuotaLimits,
): number {
  return Math.max(
    0,
    Math.min(
      limits.dailyMicroUsd - (daily?.reservedMicroUsd ?? 0),
      limits.monthlyMicroUsd - (monthly?.reservedMicroUsd ?? 0),
    ),
  );
}

export function decideReserve(
  daily: QuotaCounter | null,
  monthly: QuotaCounter | null,
  estimateMicroUsd: number,
  nowMs: number,
  limits: QuotaLimits,
): ReserveDecision {
  if (estimateMicroUsd > limits.perRequestMicroUsd) {
    return { ok: false, result: { status: "exhausted", window: "perRequest" } };
  }
  const d = daily ?? emptyCounter(utcDayWindow(nowMs), nowMs);
  const m = monthly ?? emptyCounter(utcMonthWindow(nowMs), nowMs);
  if (d.reservedMicroUsd + estimateMicroUsd > limits.dailyMicroUsd) {
    return { ok: false, result: { status: "exhausted", window: "daily" } };
  }
  if (m.reservedMicroUsd + estimateMicroUsd > limits.monthlyMicroUsd) {
    return { ok: false, result: { status: "exhausted", window: "monthly" } };
  }
  const warningsCrossed: QuotaWindow[] = [];
  const advance = (c: QuotaCounter, limit: number, name: QuotaWindow): QuotaCounter => {
    const reservedMicroUsd = c.reservedMicroUsd + estimateMicroUsd;
    const crosses = crossesWarning(c, reservedMicroUsd, limit);
    if (crosses) warningsCrossed.push(name);
    return {
      ...c,
      reservedMicroUsd,
      warnedAtMs: crosses ? nowMs : c.warnedAtMs,
      updatedAtMs: nowMs,
    };
  };
  return {
    ok: true,
    daily: advance(d, limits.dailyMicroUsd, "daily"),
    monthly: advance(m, limits.monthlyMicroUsd, "monthly"),
    warningsCrossed,
  };
}

const RESERVATION = /^res_(\d{1,13})_(\d{1,16})_([A-Za-z0-9_.-]{1,64})$/;

/** The ID carries the estimate and the time, so a settle can find both windows and the amount. */
export function makeReservationId(estimateMicroUsd: number, nowMs: number, unique: string): string {
  const id = `res_${String(estimateMicroUsd)}_${String(nowMs)}_${unique}`;
  if (!RESERVATION.test(id)) throw invalid("invalid quota reservation");
  return id;
}

export function parseReservationId(id: string): { estimateMicroUsd: number; atMs: number } {
  const m = RESERVATION.exec(id);
  if (m === null) throw invalid("invalid quota reservation ID");
  return { estimateMicroUsd: Number(m[1]), atMs: Number(m[2]) };
}

export function assertSettleInputs(actualMicroUsd: number, limits: QuotaLimits): void {
  if (!isAmount(actualMicroUsd)) throw invalid("invalid actual cost");
  for (const limit of [limits.dailyMicroUsd, limits.monthlyMicroUsd]) {
    if (!isAmount(limit)) throw invalid("invalid quota limit");
  }
}

/**
 * Moves a counter by `delta`, never below zero; a missing counter is created. Only an upward move
 * can cross the 80% warning.
 */
export function settleCounter(
  counter: QuotaCounter | null,
  window: string,
  delta: number,
  nowMs: number,
  limit: number,
): { counter: QuotaCounter; crossed: boolean } {
  const c = counter ?? emptyCounter(window, nowMs);
  const reservedMicroUsd = Math.max(0, c.reservedMicroUsd + delta);
  const crossed = delta > 0 && crossesWarning(c, reservedMicroUsd, limit);
  return {
    counter: {
      ...c,
      reservedMicroUsd,
      warnedAtMs: crossed ? nowMs : c.warnedAtMs,
      updatedAtMs: nowMs,
    },
    crossed,
  };
}

export function counterToDoc(c: QuotaCounter): Record<string, unknown> {
  return OWNER_COLLECTIONS.quotaCounters.parse({
    window: c.window,
    reservedMicroUsd: c.reservedMicroUsd,
    warnedAtMs: c.warnedAtMs,
    updatedAtMs: c.updatedAtMs,
  });
}

export function toCounter(data: unknown): QuotaCounter {
  const d = OWNER_COLLECTIONS.quotaCounters.parse(data);
  return {
    window: d.window,
    reservedMicroUsd: d.reservedMicroUsd,
    warnedAtMs: d.warnedAtMs,
    updatedAtMs: d.updatedAtMs,
  };
}

/** `[startMs, endMs)` of a `YYYY-MM-DD` UTC day. */
export function utcDayRange(day: string): { startMs: number; endMs: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (m === null) throw invalid("day must be YYYY-MM-DD");
  const startMs = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (utcDayWindow(startMs) !== day) throw invalid("day is not a real calendar date");
  return { startMs, endMs: startMs + DAY_MS };
}

export function aiUsageToDoc(r: AIUsageRecord): Record<string, unknown> {
  return OWNER_COLLECTIONS.aiUsage.parse({
    id: r.id,
    providerId: r.providerId,
    ...(r.model !== undefined ? { model: r.model } : {}),
    ...(r.inputTokens !== undefined ? { inputTokens: r.inputTokens } : {}),
    ...(r.outputTokens !== undefined ? { outputTokens: r.outputTokens } : {}),
    estimatedMicroUsd: r.estimatedMicroUsd,
    ...(r.actualMicroUsd !== undefined ? { actualMicroUsd: r.actualMicroUsd } : {}),
    outcome: r.outcome,
    ...(r.errorCode !== undefined ? { errorCode: r.errorCode } : {}),
    userApprovedRetry: r.userApprovedRetry,
    sourceEventId: r.sourceEventId,
    stage: r.stage,
    attempt: r.attempt,
    createdAtMs: r.createdAtMs,
  });
}

export function toAiUsageRecord(data: unknown): AIUsageRecord {
  const d = OWNER_COLLECTIONS.aiUsage.parse(data);
  return {
    id: d.id,
    providerId: d.providerId,
    ...(d.model !== undefined ? { model: d.model } : {}),
    ...(d.inputTokens !== undefined ? { inputTokens: d.inputTokens } : {}),
    ...(d.outputTokens !== undefined ? { outputTokens: d.outputTokens } : {}),
    estimatedMicroUsd: d.estimatedMicroUsd,
    ...(d.actualMicroUsd !== undefined ? { actualMicroUsd: d.actualMicroUsd } : {}),
    outcome: d.outcome,
    ...(d.errorCode !== undefined ? { errorCode: d.errorCode } : {}),
    userApprovedRetry: d.userApprovedRetry,
    sourceEventId: d.sourceEventId,
    stage: d.stage,
    attempt: d.attempt,
    createdAtMs: d.createdAtMs,
  };
}
