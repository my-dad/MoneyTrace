import type { OwnerId } from "@moneytrace/domain";

/** The user's own sector for a merchant, keyed by the normalized merchant key. Server-only. */
export type MerchantSectorRecord = {
  /** The merchant key, as `normalizeMerchant` makes it. */
  id: string;
  merchantName: string;
  sector: string;
  updatedAtMs: number;
};

export type MerchantSectorRepository = {
  get(ownerId: OwnerId, merchantKey: string): Promise<MerchantSectorRecord | null>;
  /** Replaces any earlier tag for the same merchant. */
  upsert(ownerId: OwnerId, record: MerchantSectorRecord): Promise<void>;
};
