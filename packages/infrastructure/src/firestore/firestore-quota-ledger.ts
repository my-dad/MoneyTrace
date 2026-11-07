import {
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
  type ReserveResult,
} from "@moneytrace/application";
import type { OwnerId } from "@moneytrace/domain";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { ownerPath } from "./paths";

const MAX_ATTEMPTS = 10;

/**
 * `reserve` is one transaction over the daily and monthly counter documents, so concurrent
 * reservations serialize and the limits hold. If Firestore gives up on a contended transaction
 * (`ABORTED`), the error propagates: it is never reported as `exhausted`, because nothing was
 * decided.
 */
export class FirestoreQuotaLedger implements QuotaLedger {
  private readonly db: Firestore;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  constructor(db: Firestore, clock: Clock, ids: IdGenerator) {
    this.db = db;
    this.clock = clock;
    this.ids = ids;
  }

  private ref(ownerId: OwnerId, window: string) {
    return this.db.doc(ownerPath(ownerId, "quotaCounters", window));
  }

  private async read(
    t: Transaction,
    ownerId: OwnerId,
    window: string,
  ): Promise<QuotaCounter | null> {
    const s = await t.get(this.ref(ownerId, window));
    return s.exists ? toCounter(s.data()) : null;
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

  async settle(ownerId: OwnerId, reservationId: string, actualMicroUsd: number): Promise<void> {
    assertSettleInputs(actualMicroUsd);
    const { estimateMicroUsd, atMs } = parseReservationId(reservationId);
    const windows = [utcDayWindow(atMs), utcMonthWindow(atMs)];
    await this.db.runTransaction(
      async (t) => {
        const now = this.clock.nowMs();
        const current = [
          await this.read(t, ownerId, windows[0] ?? ""),
          await this.read(t, ownerId, windows[1] ?? ""),
        ];
        windows.forEach((window, i) => {
          const next = settleCounter(
            current[i] ?? null,
            window,
            actualMicroUsd - estimateMicroUsd,
            now,
          );
          t.set(this.ref(ownerId, window), counterToDoc(next));
        });
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }
}
