import type { CurrencyCode, OwnerId } from "@moneytrace/domain";
import type { FollowUpRecord } from "./follow-up-repository";

/** Mirrors the `reconciliations` schema. */
export type ReconciliationRecord = {
  id: string;
  accountId: string;
  kind: "statement" | "cashCount";
  currency: CurrencyCode;
  asOfMs: number;
  statedBalanceMinor: number;
  expectedBalanceMinor: number;
  differenceMinor: number;
  reviewStatus: "open" | "reviewed" | "adjusted" | "dismissed";
  adjustmentTransactionIds: string[];
  createdAtMs: number;
  updatedAtMs: number;
};

export type ReconciliationRepository = {
  get(ownerId: OwnerId, id: string): Promise<ReconciliationRecord | null>;
  /** Creates the count and its question atomically, only if the count's id is free. */
  recordCount(
    ownerId: OwnerId,
    record: ReconciliationRecord,
    followUp: FollowUpRecord | null,
  ): Promise<"created" | "exists">;
  listOpenCashCounts(ownerId: OwnerId): Promise<ReconciliationRecord[]>;
  /** Closes an open count; anything else (missing, already closed) is `notOpen`. */
  markStatus(
    ownerId: OwnerId,
    id: string,
    status: "adjusted" | "dismissed",
    adjustmentTransactionId: string | null,
    nowMs: number,
  ): Promise<"updated" | "notOpen">;
};
