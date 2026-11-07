import type { OwnerId } from "@moneytrace/domain";
import type { Clock } from "../ports/clock";
import type { AIUsageRecord, AIUsageRecorder } from "../ports/ai-usage-recorder";
import type { IdGenerator } from "../ports/id-generator";
import type { QuotaLedger, QuotaLimits, QuotaWindow, ReserveResult } from "../ports/quota-ledger";
import {
  aiUsageToDoc,
  assertReserveInputs,
  assertSettleInputs,
  counterToDoc,
  decideReserve,
  makeReservationId,
  parseReservationId,
  settleCounter,
  toAiUsageRecord,
  utcDayRange,
  utcDayWindow,
  utcMonthWindow,
  type QuotaCounter,
} from "../quota-rules";

function attempt<T>(fn: () => T): Promise<T> {
  try {
    return Promise.resolve(fn());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error("unknown failure"));
  }
}

/** Single-threaded, so reserve and settle are atomic by construction. Mirrors the Firestore ledger. */
export class InMemoryQuota implements QuotaLedger {
  private readonly owners = new Map<string, Map<string, QuotaCounter>>();
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  constructor(clock: Clock, ids: IdGenerator) {
    this.clock = clock;
    this.ids = ids;
  }

  private data(ownerId: OwnerId): Map<string, QuotaCounter> {
    let d = this.owners.get(ownerId);
    if (d === undefined) {
      d = new Map();
      this.owners.set(ownerId, d);
    }
    return d;
  }

  reserve(
    ownerId: OwnerId,
    estimateMicroUsd: number,
    nowMs: number,
    limits: QuotaLimits,
  ): Promise<ReserveResult> {
    return attempt(() => {
      assertReserveInputs(estimateMicroUsd, nowMs, limits);
      const d = this.data(ownerId);
      const decision = decideReserve(
        d.get(utcDayWindow(nowMs)) ?? null,
        d.get(utcMonthWindow(nowMs)) ?? null,
        estimateMicroUsd,
        nowMs,
        limits,
      );
      if (!decision.ok) return decision.result;
      d.set(decision.daily.window, decision.daily);
      d.set(decision.monthly.window, decision.monthly);
      return {
        status: "reserved",
        reservationId: makeReservationId(estimateMicroUsd, nowMs, this.ids.newId()),
        warningsCrossed: decision.warningsCrossed,
      };
    });
  }

  settle(
    ownerId: OwnerId,
    reservationId: string,
    actualMicroUsd: number,
    limits: QuotaLimits,
  ): Promise<{ warningsCrossed: QuotaWindow[] }> {
    return attempt(() => {
      assertSettleInputs(actualMicroUsd, limits);
      const { estimateMicroUsd, atMs } = parseReservationId(reservationId);
      const now = this.clock.nowMs();
      const d = this.data(ownerId);
      const warningsCrossed: QuotaWindow[] = [];
      const targets: [string, number, QuotaWindow][] = [
        [utcDayWindow(atMs), limits.dailyMicroUsd, "daily"],
        [utcMonthWindow(atMs), limits.monthlyMicroUsd, "monthly"],
      ];
      for (const [window, limit, name] of targets) {
        const r = settleCounter(
          d.get(window) ?? null,
          window,
          actualMicroUsd - estimateMicroUsd,
          now,
          limit,
        );
        d.set(window, r.counter);
        if (r.crossed) warningsCrossed.push(name);
      }
      return { warningsCrossed };
    });
  }

  /** Test access: the month's reserved total. */
  monthlyReserved(ownerId: OwnerId): number {
    return [...this.data(ownerId).values()]
      .filter((c) => c.window.length === 7)
      .reduce((sum, c) => sum + c.reservedMicroUsd, 0);
  }

  docsOf(ownerId: string): Record<string, unknown>[] {
    return [...(this.owners.get(ownerId)?.values() ?? [])].map(counterToDoc);
  }
}

export class InMemoryAiUsage implements AIUsageRecorder {
  private readonly owners = new Map<string, Map<string, Record<string, unknown>>>();
  private failures = 0;

  private data(ownerId: string): Map<string, Record<string, unknown>> {
    let d = this.owners.get(ownerId);
    if (d === undefined) {
      d = new Map();
      this.owners.set(ownerId, d);
    }
    return d;
  }

  append(ownerId: OwnerId, record: AIUsageRecord): Promise<void> {
    return attempt(() => {
      if (this.failures > 0) {
        this.failures -= 1;
        throw new Error("usage store unavailable");
      }
      this.data(ownerId).set(record.id, aiUsageToDoc(record));
    });
  }

  listForUtcDay(ownerId: OwnerId, day: string): Promise<AIUsageRecord[]> {
    return attempt(() => {
      const { startMs, endMs } = utcDayRange(day);
      return [...this.data(ownerId).values()]
        .map(toAiUsageRecord)
        .filter((r) => r.createdAtMs >= startMs && r.createdAtMs < endMs);
    });
  }

  /** Test access: make the next append fail. */
  failNextAppend(): void {
    this.failures += 1;
  }

  /** Test access: every record of an owner, in append order. */
  all(ownerId: OwnerId): AIUsageRecord[] {
    return [...this.data(ownerId).values()].map(toAiUsageRecord);
  }

  docsOf(ownerId: string): Record<string, unknown>[] {
    return [...this.data(ownerId).values()];
  }
}
