import type { MerchantSectorRecord, MerchantSectorRepository } from "@moneytrace/application";
import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import type { OwnerId } from "@moneytrace/domain";
import type { DocStore } from "../docstore/doc-store";
import { ownerPath } from "./paths";

export class FirestoreMerchantSectorRepository implements MerchantSectorRepository {
  private readonly db: DocStore;

  constructor(db: DocStore) {
    this.db = db;
  }

  async get(ownerId: OwnerId, merchantKey: string): Promise<MerchantSectorRecord | null> {
    const snap = await this.db.doc(ownerPath(ownerId, "merchantSectors", merchantKey)).get();
    return snap.exists ? OWNER_COLLECTIONS.merchantSectors.parse(snap.data()) : null;
  }

  async upsert(ownerId: OwnerId, record: MerchantSectorRecord): Promise<void> {
    await this.db.doc(ownerPath(ownerId, "merchantSectors", record.id)).set(OWNER_COLLECTIONS.merchantSectors.parse(record));
  }
}
