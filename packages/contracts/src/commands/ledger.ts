import { z } from "zod";
import {
  currencyCode,
  documentId,
  epochMs,
  nonNegativeMinorAmount,
  positiveMinorAmount,
} from "../primitives";
import { accountName, shortText, strictObject } from "./shared";

const postingStatus = z.enum(["recorded", "alreadyRecorded"]);

export const correctTransactionRequest = strictObject({
  idempotencyKey: documentId,
  transactionId: documentId,
  /** Omitted means reverse only. */
  replacement: strictObject({
    amountMinor: positiveMinorAmount,
    currency: currencyCode,
    occurredAtMs: epochMs.optional(),
  }).optional(),
  rationale: shortText,
});
export const correctTransactionResponse = strictObject({
  reversalTransactionId: documentId,
  replacementTransactionId: documentId.optional(),
  status: postingStatus,
});

export const recordCustodyTransferRequest = strictObject({
  idempotencyKey: documentId,
  fromAccountId: documentId,
  toAccountId: documentId,
  amountMinor: positiveMinorAmount,
  currency: currencyCode,
  holderName: accountName,
  occurredAtMs: epochMs,
});
export const recordCustodyTransferResponse = strictObject({
  transactionId: documentId,
  status: postingStatus,
});

export const upsertCashAllocationRequest = strictObject({
  walletId: documentId,
  purpose: shortText,
  amountMinor: positiveMinorAmount,
  currency: currencyCode,
});
export const upsertCashAllocationResponse = strictObject({ allocationId: documentId });

/** A cash count (PRD gate 32). The server compares it with the Cash accounts and picks the time. */
export const recordReconciliationRequest = strictObject({
  idempotencyKey: documentId,
  countedMinor: nonNegativeMinorAmount,
  currency: currencyCode,
});
export const recordReconciliationResponse = strictObject({
  reconciliationId: documentId,
  status: postingStatus,
  countedMinor: nonNegativeMinorAmount,
  expectedMinor: z.number().int(),
  cashMinor: z.number().int(),
  unexplainedMinor: z.number().int(),
  differenceMinor: z.number().int(),
  /** Present when the count differs: the question that stays open in the chat. */
  followUpId: documentId.optional(),
});

/** Adjusts Cash to a stored count; the server derives direction and amount from the count. */
export const recordAdjustmentRequest = strictObject({
  reconciliationId: documentId,
  cause: shortText,
});
export const recordAdjustmentResponse = strictObject({
  transactionId: documentId,
  status: postingStatus,
  countedMinor: nonNegativeMinorAmount,
  adjustmentMinor: positiveMinorAmount,
});

/** "Not a transfer": counts a wrongly paired transfer's two SMS separately again (CR-008 §9). */
export const splitTransferRequest = strictObject({ sourceEventId: documentId });
export const splitTransferResponse = strictObject({
  spentTransactionId: documentId,
  cameInTransactionId: documentId,
  amountMinor: positiveMinorAmount,
  status: postingStatus,
});
