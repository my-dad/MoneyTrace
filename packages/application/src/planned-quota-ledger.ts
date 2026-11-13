import { asOwnerId, type OwnerId } from "@moneytrace/domain";
import type { QuotaLedger, QuotaLimits, QuotaWindow, ReserveResult } from "./ports/quota-ledger";

export type AiPlan = "owner" | "member";

/** Mabrur's own budget (PRD §12 default): USD 0.05 a request, 0.50 a day, 5 a month. */
export const OWNER_QUOTA_LIMITS: QuotaLimits = { perRequestMicroUsd: 50_000, dailyMicroUsd: 500_000, monthlyMicroUsd: 5_000_000 };
/** Everyone else (CR-009): USD 0.20 a day, 1 a month. */
export const MEMBER_QUOTA_LIMITS: QuotaLimits = { perRequestMicroUsd: 50_000, dailyMicroUsd: 200_000, monthlyMicroUsd: 1_000_000 };
/** The counters every user's spending also goes on. Not a real user id (those are UUIDs). */
export const GLOBAL_QUOTA_OWNER: OwnerId = asOwnerId("all-users");

/**
 * Each owner's AI limits come from their plan, not from the caller, and every reservation also
 * counts against one global monthly cap (CR-009, USD 10). The global counter is reserved first and
 * released if the user's own limit refuses, so a crash between the two can only over-count, never
 * let spending past the cap. Settling reuses the user's reservation id: it carries the estimate
 * and time, which is all a settle needs.
 */
export class PlannedQuotaLedger implements QuotaLedger {
  private readonly inner: QuotaLedger;
  private readonly planOf: (ownerId: OwnerId) => Promise<AiPlan>;
  private readonly global: QuotaLimits;

  constructor(deps: { inner: QuotaLedger; planOf: (ownerId: OwnerId) => Promise<AiPlan>; globalMonthlyMicroUsd: number }) {
    this.inner = deps.inner;
    this.planOf = deps.planOf;
    this.global = {
      perRequestMicroUsd: OWNER_QUOTA_LIMITS.perRequestMicroUsd,
      dailyMicroUsd: deps.globalMonthlyMicroUsd,
      monthlyMicroUsd: deps.globalMonthlyMicroUsd,
    };
  }

  private async limits(ownerId: OwnerId): Promise<QuotaLimits> {
    return (await this.planOf(ownerId)) === "owner" ? OWNER_QUOTA_LIMITS : MEMBER_QUOTA_LIMITS;
  }

  /** The caller's `limits` are ignored here and below: the owner's plan decides. */
  async availableMicroUsd(ownerId: OwnerId, nowMs: number): Promise<number> {
    const [own, all] = await Promise.all([
      this.inner.availableMicroUsd(ownerId, nowMs, await this.limits(ownerId)),
      this.inner.availableMicroUsd(GLOBAL_QUOTA_OWNER, nowMs, this.global),
    ]);
    return Math.min(own, all);
  }

  async reserve(ownerId: OwnerId, estimateMicroUsd: number, nowMs: number): Promise<ReserveResult> {
    const limits = await this.limits(ownerId);
    const global = await this.inner.reserve(GLOBAL_QUOTA_OWNER, estimateMicroUsd, nowMs, this.global);
    if (global.status === "exhausted") return { status: "exhausted", window: global.window === "perRequest" ? "perRequest" : "monthly" };
    const own = await this.inner.reserve(ownerId, estimateMicroUsd, nowMs, limits);
    if (own.status === "exhausted") await this.inner.settle(GLOBAL_QUOTA_OWNER, global.reservationId, 0, this.global);
    return own;
  }

  async settle(ownerId: OwnerId, reservationId: string, actualMicroUsd: number): Promise<{ warningsCrossed: QuotaWindow[] }> {
    const own = await this.inner.settle(ownerId, reservationId, actualMicroUsd, await this.limits(ownerId));
    await this.inner.settle(GLOBAL_QUOTA_OWNER, reservationId, actualMicroUsd, this.global);
    return own;
  }
}
