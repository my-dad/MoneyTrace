import type { OwnerId } from "@moneytrace/domain";

export type QuotaLimits = {
  perRequestMicroUsd: number;
  dailyMicroUsd: number;
  monthlyMicroUsd: number;
};

/** USD 0.05 per request, USD 0.50 per day and USD 5 per month (PRD section 12); UTC windows. */
export const DEFAULT_QUOTA_LIMITS: QuotaLimits = {
  perRequestMicroUsd: 50_000,
  dailyMicroUsd: 500_000,
  monthlyMicroUsd: 5_000_000,
};

export type QuotaWindow = "daily" | "monthly";

export type ReserveResult =
  | { status: "reserved"; reservationId: string; warningsCrossed: QuotaWindow[] }
  | { status: "exhausted"; window: "perRequest" | QuotaWindow };

/**
 * Reserves before a call and reconciles afterward. `reserve` never over-reserves under
 * contention; a transaction that cannot complete throws instead of reporting `exhausted`.
 * `warningsCrossed` is non-empty only on the reservation that first takes a window to 80%.
 * The reservation ID carries its estimate and time, so `settle` needs no extra storage; call it
 * once per reservation.
 */
export type QuotaLedger = {
  reserve(
    ownerId: OwnerId,
    estimateMicroUsd: number,
    nowMs: number,
    limits: QuotaLimits,
  ): Promise<ReserveResult>;
  settle(ownerId: OwnerId, reservationId: string, actualMicroUsd: number): Promise<void>;
};
