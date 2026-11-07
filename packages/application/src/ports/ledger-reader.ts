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
  rationale?: string;
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
  /** The stored cutover markers for the given accounts; accounts without one are omitted. */
  getCutoverMarkers(
    ownerId: OwnerId,
    accountIds: readonly AccountId[],
  ): Promise<StoredCutoverMarker[]>;
};
