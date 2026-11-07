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

export const recordReconciliationRequest = strictObject({
  accountId: documentId,
  countedMinor: nonNegativeMinorAmount,
  currency: currencyCode,
  countedAtMs: epochMs,
});
export const recordReconciliationResponse = strictObject({
  reconciliationId: documentId,
  differenceMinor: z.number().int(),
});

export const recordAdjustmentRequest = strictObject({
  idempotencyKey: documentId,
  accountId: documentId,
  direction: z.enum(["increase", "decrease"]),
  amountMinor: positiveMinorAmount,
  currency: currencyCode,
  cause: shortText,
});
export const recordAdjustmentResponse = strictObject({
  transactionId: documentId,
  status: postingStatus,
});
