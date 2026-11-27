import type { TipsDoc, TipsFields, TipsRepository } from "@moneytrace/application";
import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import { DomainError, type OwnerId } from "@moneytrace/domain";
import type { DocStore } from "../docstore/doc-store";
import { ownerPath } from "./paths";

const MAX_ATTEMPTS = 10;

/** `users/{uid}/tips/current`. Saves and New tips claims are transactions, so neither loses the other. */
export class FirestoreTipsRepository implements TipsRepository {
  private readonly db: DocStore;

  constructor(db: DocStore) {
    this.db = db;
  }

  private ref(ownerId: OwnerId) {
    return this.db.doc(ownerPath(ownerId, "tips", "current"));
  }

  async get(ownerId: OwnerId): Promise<TipsDoc | null> {
    const snap = await this.ref(ownerId).get();
    return snap.exists ? OWNER_COLLECTIONS.tips.parse(snap.data()) : null;
  }

  async save(ownerId: OwnerId, fields: TipsFields): Promise<void> {
    const ref = this.ref(ownerId);
    await this.db.runTransaction(
      async (t) => {
        const snap = await t.get(ref);
        const current = snap.exists ? OWNER_COLLECTIONS.tips.parse(snap.data()) : null;
        t.set(ref, OWNER_COLLECTIONS.tips.parse({ ...fields, id: "current", forcedDay: current?.forcedDay ?? null, forcedToday: current?.forcedToday ?? 0 }));
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }

  async claimForced(ownerId: OwnerId, dhakaDay: string, max: number): Promise<number | null> {
    const ref = this.ref(ownerId);
    return this.db.runTransaction(
      async (t) => {
        const snap = await t.get(ref);
        if (!snap.exists) throw new DomainError("resourceNotFound", "no tips yet");
        const current = OWNER_COLLECTIONS.tips.parse(snap.data());
        const used = current.forcedDay === dhakaDay ? current.forcedToday : 0;
        if (used >= max) return null;
        t.set(ref, OWNER_COLLECTIONS.tips.parse({ ...current, forcedDay: dhakaDay, forcedToday: used + 1 }));
        return used + 1;
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }
}
