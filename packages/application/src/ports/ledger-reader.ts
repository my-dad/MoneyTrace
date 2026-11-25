import type {
  AccountId,
  CurrencyCode,
  OwnerId,
  PostingIntent,
  SourceEventId,
  TransactionId,
  TransactionState,
  AccountKind,
  CutoverMarker,
} from "@moneytrace/domain";

/** Mirrors the `transactions` schema in `@moneytrace/contracts`. */
export type TransactionRecord = {
  id: TransactionId;
  state: TransactionState;
  intentType: PostingIntent["type"];
  occurredAtMs: number;
  currency: CurrencyCode;
  sourceEventIds: readonly SourceEventId[];
  actor: string;
  /** The expense or income category, when the intent has one. */
  category?: string;
  /** The provider's own transaction ID, when the evidence gives one. */
  reference?: string;
  rationale?: string;
  /** The merchant the evidence names, tidied. */
  merchant?: string;
  /** The merchant's normalized key, the same for every spelling of one shop. */
  merchantKey?: string;
  correctionOf?: TransactionId;
  reversedBy?: TransactionId;
  auditDetails?: { cause?: string; authorizedBy?: string; holderName?: string };
  committedAtMs: number;
};

/** Mirrors the `ledgerEntries` schema in `@moneytrace/contracts`. */
export type EntryRecord = {
  /** `<transactionId>:<seq>`, seq starting at 1. */
  id: string;
  transactionId: TransactionId;
  accountId: AccountId;
  accountKind: AccountKind;
  side: "debit" | "credit";
  amountMinor: number;
  currency: CurrencyCode;
  occurredAtMs: number;
};

/** A marker plus the opening-balance transaction that currently owns it. */
export type StoredCutoverMarker = CutoverMarker & { transactionId: TransactionId };

export type LedgerReader = {
  getTransaction(ownerId: OwnerId, id: TransactionId): Promise<TransactionRecord | null>;
  getEntries(ownerId: OwnerId, txId: TransactionId): Promise<EntryRecord[]>;
  /** The stored projection: debits minus credits. */
  getBalance(ownerId: OwnerId, accountId: AccountId): Promise<number>;
  /** The same figure summed from entries; used to prove the projection. */
  recomputeBalance(ownerId: OwnerId, accountId: AccountId): Promise<number>;
  /** Up to `limit` transactions whose merchant has this key, in any state. */
  listByMerchantKey(ownerId: OwnerId, merchantKey: string, limit: number): Promise<TransactionRecord[]>;
  /** Every entry dated in the inclusive range, across the owner's accounts. */
  listEntriesInRange(ownerId: OwnerId, fromMs: number, toMs: number): Promise<EntryRecord[]>;
  /** The stored cutover markers for the given accounts; accounts without one are omitted. */
  getCutoverMarkers(
    ownerId: OwnerId,
    accountIds: readonly AccountId[],
  ): Promise<StoredCutoverMarker[]>;
};
