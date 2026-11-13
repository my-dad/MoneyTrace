import {
  decideResolve,
  decideSnooze,
  decideWake,
  type FollowUpRecord,
  type FollowUpRepository,
} from "@moneytrace/application";
import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import { asOwnerId, type OwnerId } from "@moneytrace/domain";
import type { DocStore } from "../docstore/doc-store";
import { ownerPath } from "./paths";

const MAX_ATTEMPTS = 5;

const toRecord = (data: unknown): FollowUpRecord =>
  OWNER_COLLECTIONS.followUps.parse(data) as FollowUpRecord;

export class FirestoreFollowUpRepository implements FollowUpRepository {
  private readonly db: DocStore;

  constructor(db: DocStore) {
    this.db = db;
  }

  private ref(ownerId: OwnerId, id: string) {
    return this.db.doc(ownerPath(ownerId, "followUps", id));
  }

  async get(ownerId: OwnerId, id: string): Promise<FollowUpRecord | null> {
    const s = await this.ref(ownerId, id).get();
    return s.exists ? toRecord(s.data()) : null;
  }

  async listOpen(ownerId: OwnerId): Promise<FollowUpRecord[]> {
    const snap = await this.db
      .collection(ownerPath(ownerId, "followUps"))
      .where("state", "==", "open")
      .get();
    return snap.docs.map((d) => toRecord(d.data()));
  }

  private transition<R extends string>(
    ownerId: OwnerId,
    id: string,
    decide: (f: FollowUpRecord) => FollowUpRecord | null,
    done: R,
    refused: R,
  ): Promise<R> {
    const ref = this.ref(ownerId, id);
    return this.db.runTransaction(
      async (t) => {
        const s = await t.get(ref);
        if (!s.exists) return refused;
        const next = decide(toRecord(s.data()));
        if (next === null) return refused;
        t.set(ref, OWNER_COLLECTIONS.followUps.parse(next));
        return done;
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }

  resolve(
    ownerId: OwnerId,
    id: string,
    resolution: string,
    nowMs: number,
  ): Promise<"resolved" | "alreadyClosed"> {
    return this.transition(
      ownerId,
      id,
      (f) => decideResolve(f, resolution, nowMs),
      "resolved",
      "alreadyClosed",
    );
  }

  snooze(ownerId: OwnerId, id: string, untilMs: number): Promise<"snoozed" | "alreadyClosed"> {
    return this.transition(
      ownerId,
      id,
      (f) => decideSnooze(f, untilMs),
      "snoozed",
      "alreadyClosed",
    );
  }

  async pushDue(ownerId: OwnerId, id: string, dueAtMs: number): Promise<void> {
    await this.transition(ownerId, id, (f) => ({ ...f, dueAtMs }), "done", "done");
  }

  /** One equality and one range on a collection group: see firestore.indexes.json. */
  async listDueToWake(nowMs: number, limit: number): Promise<{ ownerId: OwnerId; id: string }[]> {
    const snap = await this.db
      .collectionGroup("followUps")
      .where("state", "==", "snoozed")
      .where("snoozedUntilMs", "<=", nowMs)
      .limit(limit)
      .get();
    const rows: { ownerId: OwnerId; id: string }[] = [];
    for (const doc of snap.docs) {
      const owner = doc.ref.parent.parent;
      if (owner?.parent.id === "users") rows.push({ ownerId: asOwnerId(owner.id), id: doc.id });
    }
    return rows;
  }

  wake(ownerId: OwnerId, id: string, nowMs: number): Promise<"woken" | "notSnoozed"> {
    return this.transition(ownerId, id, (f) => decideWake(f, nowMs), "woken", "notSnoozed");
  }
}
