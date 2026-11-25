import type { OwnerId } from "@moneytrace/domain";
import type { MerchantSectorRecord, MerchantSectorRepository } from "../ports/merchant-sector-repository";

export class InMemoryMerchantSectors implements MerchantSectorRepository {
  private readonly rows = new Map<string, MerchantSectorRecord>();

  get(ownerId: OwnerId, merchantKey: string): Promise<MerchantSectorRecord | null> {
    const row = this.rows.get(`${ownerId}/${merchantKey}`);
    return Promise.resolve(row === undefined ? null : { ...row });
  }

  upsert(ownerId: OwnerId, record: MerchantSectorRecord): Promise<void> {
    this.rows.set(`${ownerId}/${record.id}`, { ...record });
    return Promise.resolve();
  }
}
