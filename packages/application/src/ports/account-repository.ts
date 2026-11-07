import type { AccountId, CurrencyCode, OwnerId, RealAccountKind } from "@moneytrace/domain";

export type AccountRecord = {
  id: AccountId;
  kind: RealAccountKind;
  name: string;
  currency: CurrencyCode;
  status: "active" | "closed";
  createdAtMs: number;
};

export type AccountRepository = {
  create(ownerId: OwnerId, record: AccountRecord): Promise<void>;
  /** Creates the account only if its ID is free; an existing one is left as it is. */
  ensure(ownerId: OwnerId, record: AccountRecord): Promise<void>;
  /** Returns only the accounts that exist for this owner; unknown and foreign IDs are omitted. */
  getMany(ownerId: OwnerId, ids: readonly AccountId[]): Promise<AccountRecord[]>;
};
