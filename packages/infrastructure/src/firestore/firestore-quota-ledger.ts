import {
  availableIn,
  assertReserveInputs,
  assertSettleInputs,
  counterToDoc,
  decideReserve,
  makeReservationId,
  parseReservationId,
  settleCounter,
  toCounter,
  utcDayWindow,
  utcMonthWindow,
  type Clock,
  type IdGenerator,
  type QuotaCounter,
  type QuotaLedger,
  type QuotaLimits,
  type QuotaWindow,
  type ReserveResult,
} from "@moneytrace/application";
import type { OwnerId } from "@moneytrace/domain";
import type { DocStore, DocTransaction } from "../docstore/doc-store";
import { ownerPath } from "./paths";

const MAX_ATTEMPTS = 10;

/**
 * `reserve` is one transaction over the daily and monthly counter documents, so concurrent
 * reservations serialize and the limits hold. If Firestore gives up on a contended transaction
 * (`ABORTED`), the error propagates: it is never reported as `exhausted`, because nothing was
 * decided.
 */
export class FirestoreQuotaLedger implements QuotaLedger {
  private readonly db: DocStore;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  constructor(db: DocStore, clock: Clock, ids: IdGenerator) {
    this.db = db;
    this.clock = clock;
    this.ids = ids;
  }

  private ref(ownerId: OwnerId, window: string) {
    return this.db.doc(ownerPath(ownerId, "quotaCounters", window));
  }

  private async read(
    t: DocTransaction,
    ownerId: OwnerId,
    window: string,
  ): Promise<QuotaCounter | null> {
    const s = await t.get(this.ref(ownerId, window));
    return s.exists ? toCounter(s.data()) : null;
  }

  async availableMicroUsd(ownerId: OwnerId, nowMs: number, limits: QuotaLimits): Promise<number> {
    const [daily, monthly] = await Promise.all([
      this.ref(ownerId, utcDayWindow(nowMs)).get(),
      this.ref(ownerId, utcMonthWindow(nowMs)).get(),
    ]);
    return availableIn(
      daily.exists ? toCounter(daily.data()) : null,
      monthly.exists ? toCounter(monthly.data()) : null,
      limits,
    );
  }

  async reserve(
    ownerId: OwnerId,
    estimateMicroUsd: number,
    nowMs: number,
    limits: QuotaLimits,
  ): Promise<ReserveResult> {
    assertReserveInputs(estimateMicroUsd, nowMs, limits);
    const dayWindow = utcDayWindow(nowMs);
    const monthWindow = utcMonthWindow(nowMs);
    return await this.db.runTransaction(
      async (t): Promise<ReserveResult> => {
        const [daily, monthly] = [
          await this.read(t, ownerId, dayWindow),
          await this.read(t, ownerId, monthWindow),
        ];
        const decision = decideReserve(daily, monthly, estimateMicroUsd, nowMs, limits);
        if (!decision.ok) return decision.result;
        t.set(this.ref(ownerId, dayWindow), counterToDoc(decision.daily));
        t.set(this.ref(ownerId, monthWindow), counterToDoc(decision.monthly));
        return {
          status: "reserved",
          reservationId: makeReservationId(estimateMicroUsd, nowMs, this.ids.newId()),
          warningsCrossed: decision.warningsCrossed,
        };
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }

  async settle(
    ownerId: OwnerId,
    reservationId: string,
    actualMicroUsd: number,
    limits: QuotaLimits,
  ): Promise<{ warningsCrossed: QuotaWindow[] }> {
    assertSettleInputs(actualMicroUsd, limits);
    const { estimateMicroUsd, atMs } = parseReservationId(reservationId);
    const dayTarget: [string, number, QuotaWindow] = [
      utcDayWindow(atMs),
      limits.dailyMicroUsd,
      "daily",
    ];
    const monthTarget: [string, number, QuotaWindow] = [
      utcMonthWindow(atMs),
      limits.monthlyMicroUsd,
      "monthly",
    ];
    const targets = [dayTarget, monthTarget];
    return await this.db.runTransaction(
      async (t) => {
        const now = this.clock.nowMs();
        const current = [
          await this.read(t, ownerId, dayTarget[0]),
          await this.read(t, ownerId, monthTarget[0]),
        ];
        // Built per attempt: Firestore may run this callback again after a contention retry.
        const warningsCrossed: QuotaWindow[] = [];
        targets.forEach(([window, limit, name], i) => {
          const r = settleCounter(
            current[i] ?? null,
            window,
            actualMicroUsd - estimateMicroUsd,
            now,
            limit,
          );
          t.set(this.ref(ownerId, window), counterToDoc(r.counter));
          if (r.crossed) warningsCrossed.push(name);
        });
        return { warningsCrossed };
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }
}
