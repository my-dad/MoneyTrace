import type { PipelineLease } from "@moneytrace/application";
import type { OwnerId } from "@moneytrace/domain";
import type { DocStore } from "../docstore/doc-store";

/** Server-only, one document per owner while their evidence is advancing. Deleted on release; a scheduled job deletes any past `expiresAtMs`. */
export const PIPELINE_LEASE_COLLECTION = "pipelineLeases";

export class FirestorePipelineLease implements PipelineLease {
  private readonly db: DocStore;

  constructor(db: DocStore) {
    this.db = db;
  }

  acquire(ownerId: OwnerId, holder: string, nowMs: number, leaseMs: number): Promise<boolean> {
    const ref = this.db.collection(PIPELINE_LEASE_COLLECTION).doc(ownerId);
    return this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (snap.exists && snap.get("holder") !== holder && Number(snap.get("expiresAtMs")) > nowMs) return false;
      t.set(ref, { holder, expiresAtMs: nowMs + leaseMs });
      return true;
    });
  }

  async release(ownerId: OwnerId, holder: string): Promise<void> {
    const ref = this.db.collection(PIPELINE_LEASE_COLLECTION).doc(ownerId);
    await this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (snap.exists && snap.get("holder") === holder) t.delete(ref);
    });
  }
}
