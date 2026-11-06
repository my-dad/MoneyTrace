import { z } from "zod";
import {
  basisPoints,
  currencyCode,
  documentId,
  epochMs,
  minorAmount,
  nonNegativeMinorAmount,
  positiveMinorAmount,
} from "../primitives";

const count = z.number().int().nonnegative();
const text = z.string().min(1).max(2000);
const name = z.string().min(1).max(200);
const ids = z.array(documentId);

const accountKind = z.enum(["bank", "cash", "familyCash", "creditLiability"]);
const ledgerAccountKind = z.enum([
  "bank",
  "cash",
  "familyCash",
  "creditLiability",
  "expense",
  "income",
  "equity",
]);
const stage = z.enum(["normalize", "interpret", "match", "decide", "post"]);

const intentType = z.enum([
  "withdrawal",
  "transfer",
  "purchase",
  "cardPurchase",
  "cardRepayment",
  "income",
  "fee",
  "refund",
  "adjustment",
  "openingBalance",
  "cashCustodyTransfer",
  "historicalImport",
]);

const accounts = z
  .object({
    id: documentId,
    kind: accountKind,
    name,
    currency: currencyCode,
    status: z.enum(["active", "closed"]),
    createdAtMs: epochMs,
  })
  .strict();

const paymentInstruments = z
  .object({
    id: documentId,
    kind: z.enum(["debitCard", "creditCard"]),
    /** Masked identifier only, for example the last four digits. */
    maskedIdentifier: z.string().min(1).max(32),
    linkedAccountId: documentId,
    status: z.enum(["active", "closed"]),
    createdAtMs: epochMs,
  })
  .strict();

const sourceEvents = z
  .object({
    id: documentId,
    sourceType: z.enum(["sms", "receipt", "chat", "csvImport"]),
    sourceHash: z.string().min(1).max(128),
    idempotencyKey: documentId,
    status: z.enum([
      "received",
      "normalized",
      "interpreted",
      "matched",
      "decided",
      "posted",
      "linkedAsDuplicate",
      "rejected",
      "cancelled",
      "pending",
      "deadLetter",
    ]),
    pendingReason: z
      .enum(["awaitingClarification", "aiQuotaExhausted", "providerOutcomeUnknown"])
      .optional(),
    deadLetterReason: z
      .enum(["attemptsExhausted", "providerResultMissing", "stageFailed"])
      .optional(),
    stageAttempt: count,
    claim: z
      .object({ workerId: z.string().min(1).max(128), stage, leaseExpiresAtMs: epochMs })
      .strict()
      .nullable(),
    parkedStage: stage.nullable(),
    version: count,
    receivedAtMs: epochMs,
    terminalAtMs: epochMs.nullable(),
    providerResultsPurged: z.boolean(),
  })
  .strict();

const providerCalls = z
  .object({
    id: documentId,
    sourceEventId: documentId,
    stage,
    providerId: z.string().min(1).max(64),
    retrySafety: z.enum(["idempotentKey", "localPure", "none"]),
    state: z.enum(["started", "succeeded", "failed", "unknown", "purged"]),
    requestKey: z.string().min(1).max(256),
    attemptCount: count,
    userApprovedRetry: z.boolean(),
    retriedAfterUnknown: z.boolean(),
    quotaReservationId: documentId.optional(),
    result: z.unknown().optional(),
    updatedAtMs: epochMs,
  })
  .strict();

const transactions = z
  .object({
    id: documentId,
    state: z.enum(["pending", "posted", "rejected", "reversed"]),
    intentType,
    occurredAtMs: epochMs,
    currency: currencyCode,
    sourceEventIds: ids,
    actor: z.string().min(1).max(128),
    rationale: text.optional(),
    correctionOf: documentId.optional(),
    reversedBy: documentId.optional(),
    /** Adjustments keep cause and authorization; custody transfers keep the holder's name. */
    auditDetails: z
      .object({
        cause: text.optional(),
        authorizedBy: name.optional(),
        holderName: name.optional(),
      })
      .strict()
      .optional(),
    committedAtMs: epochMs,
  })
  .strict();

const ledgerEntries = z
  .object({
    /** `<transactionId>:<seq>` */
    id: documentId,
    transactionId: documentId,
    accountId: documentId,
    accountKind: ledgerAccountKind,
    side: z.enum(["debit", "credit"]),
    amountMinor: positiveMinorAmount,
    currency: currencyCode,
    occurredAtMs: epochMs,
  })
  .strict();

const balances = z
  .object({
    accountId: documentId,
    accountKind: ledgerAccountKind,
    currency: currencyCode,
    /** Signed raw. A liability's displayed amount owed is the negation. */
    debitMinusCreditMinor: minorAmount,
    version: count,
    updatedAtMs: epochMs,
  })
  .strict();

const idempotencyRecords = z
  .object({
    key: z.string().min(1).max(256),
    payloadHash: z.string().min(1).max(128),
    transactionId: documentId.optional(),
    sourceEventId: documentId.optional(),
    createdAtMs: epochMs,
  })
  .strict();

const cutoverMarkers = z
  .object({ accountId: documentId, effectiveAtMs: epochMs, transactionId: documentId })
  .strict();

const decisionBase = {
  id: documentId,
  outcome: z.enum(["autoPost", "needsClarification", "failed"]),
  rule: z.string().min(1).max(128),
  configVersion: z.number().int().positive(),
  aiAutoPostThresholdBp: z.number().int().min(0).max(10001),
  confidenceBp: basisPoints,
  evidenceFields: z.array(z.string().min(1).max(128)),
  retriedAfterUnknown: z.boolean(),
  sourceEventIds: ids,
  createdAtMs: epochMs,
};

const decisionRecords = z.discriminatedUnion("source", [
  z
    .object({
      ...decisionBase,
      source: z.literal("deterministicParser"),
      parser: z
        .object({ name: z.string().min(1).max(128), version: z.string().min(1).max(64) })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...decisionBase,
      source: z.literal("ai"),
      ai: z
        .object({ model: z.string().min(1).max(128), promptVersion: z.string().min(1).max(64) })
        .strict(),
    })
    .strict(),
]);

const cashAllocations = z
  .object({
    id: documentId,
    walletAccountId: documentId,
    purpose: text,
    currency: currencyCode,
    allocatedMinor: positiveMinorAmount,
    remainingMinor: nonNegativeMinorAmount,
    status: z.enum(["active", "exhausted", "closed"]),
    history: z
      .array(
        z
          .object({
            atMs: epochMs,
            kind: z.enum(["allocated", "spent", "released"]),
            amountMinor: positiveMinorAmount,
            transactionId: documentId.optional(),
          })
          .strict(),
      )
      .max(200),
    createdAtMs: epochMs,
    updatedAtMs: epochMs,
  })
  .strict();

const reconciliations = z
  .object({
    id: documentId,
    accountId: documentId,
    kind: z.enum(["statement", "cashCount"]),
    currency: currencyCode,
    asOfMs: epochMs,
    statedBalanceMinor: minorAmount,
    expectedBalanceMinor: minorAmount,
    differenceMinor: minorAmount,
    reviewStatus: z.enum(["open", "reviewed", "adjusted", "dismissed"]),
    adjustmentTransactionIds: ids,
    createdAtMs: epochMs,
    updatedAtMs: epochMs,
  })
  .strict();

const followUps = z
  .object({
    id: documentId,
    trigger: z.enum([
      "withdrawalDestination",
      "unreviewedCashActivity",
      "reconciliationDifference",
    ]),
    targetTransactionId: documentId.optional(),
    targetAccountId: documentId.optional(),
    question: text,
    dueAtMs: epochMs,
    snoozedUntilMs: epochMs.nullable(),
    state: z.enum(["open", "snoozed", "resolved", "dismissed"]),
    resolution: text.optional(),
    createdAtMs: epochMs,
    resolvedAtMs: epochMs.nullable(),
  })
  .strict();

const conversations = z
  .object({
    id: documentId,
    title: name.optional(),
    createdAtMs: epochMs,
    updatedAtMs: epochMs,
    expiresAtMs: epochMs,
  })
  .strict();

const conversationMessages = z
  .object({
    id: documentId,
    conversationId: documentId,
    role: z.enum(["user", "assistant"]),
    text: z.string().max(20000),
    evidenceSourceEventIds: ids,
    approvedOperationIds: ids,
    createdAtMs: epochMs,
    expiresAtMs: epochMs,
  })
  .strict();

const aiUsage = z
  .object({
    id: documentId,
    providerId: z.string().min(1).max(64),
    model: z.string().min(1).max(128).optional(),
    inputTokens: count.optional(),
    outputTokens: count.optional(),
    estimatedMicroUsd: count,
    actualMicroUsd: count.optional(),
    outcome: z.enum(["success", "definiteFailure", "unknown"]),
    errorCode: z.string().min(1).max(64).optional(),
    userApprovedRetry: z.boolean(),
    sourceEventId: documentId,
    stage,
    attempt: count,
    createdAtMs: epochMs,
  })
  .strict();

const quotaCounters = z
  .object({
    /** `YYYY-MM` or `YYYY-MM-DD`, UTC. Also the document ID. */
    window: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
    reservedMicroUsd: count,
    warnedAtMs: epochMs.nullable(),
    updatedAtMs: epochMs,
  })
  .strict();

const temporaryUploads = z
  .object({
    id: documentId,
    storagePath: z.string().min(1).max(512),
    mimeType: z.string().min(1).max(128),
    sizeBytes: count,
    state: z.enum(["uploaded", "processing", "persisted", "deleted", "deletionFailed", "expired"]),
    sourceEventId: documentId.optional(),
    createdAtMs: epochMs,
    expiresAtMs: epochMs,
    deletionAttempts: count,
    deletionVerifiedAtMs: epochMs.nullable(),
  })
  .strict();

const consents = z
  .object({
    id: documentId,
    kind: z.enum(["aiProcessing", "ocrProcessing", "retentionPolicy"]),
    policyVersion: z.number().int().positive(),
    granted: z.boolean(),
    decidedAtMs: epochMs,
  })
  .strict();

const deletionJobs = z
  .object({
    id: documentId,
    state: z.enum(["requested", "running", "completed", "failed"]),
    attemptCount: count,
    failureCode: z.string().min(1).max(64).optional(),
    requestedAtMs: epochMs,
    updatedAtMs: epochMs,
    completedAtMs: epochMs.nullable(),
  })
  .strict();

export const OWNER_COLLECTIONS = {
  accounts,
  paymentInstruments,
  sourceEvents,
  providerCalls,
  transactions,
  ledgerEntries,
  balances,
  idempotencyRecords,
  cutoverMarkers,
  decisionRecords,
  cashAllocations,
  reconciliations,
  followUps,
  conversations,
  conversationMessages,
  aiUsage,
  quotaCounters,
  temporaryUploads,
  consents,
  deletionJobs,
} as const;

export type OwnerCollectionName = keyof typeof OWNER_COLLECTIONS;

/** The `users/{uid}` document. */
export const userProfileSchema = z
  .object({
    displayName: name.optional(),
    baseCurrency: currencyCode,
    reportingCycle: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("calendarMonth") }).strict(),
      z
        .object({ kind: z.literal("salaryCycle"), startDay: z.number().int().min(1).max(28) })
        .strict(),
    ]),
    notifications: z
      .object({
        digestLocalTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        frequency: z.enum(["daily", "weekly", "off"]),
        minThresholdMinor: nonNegativeMinorAmount,
        quietHours: z
          .object({
            startLocalTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
            endLocalTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          })
          .strict()
          .optional(),
      })
      .strict(),
    retentionPolicyVersion: z.number().int().positive(),
    createdAtMs: epochMs,
  })
  .strict();

/** Top-level, server-only. Outside `users/`, so it survives account deletion. */
export const deletionLogEntrySchema = z
  .object({ ownerIdHash: z.string().min(1).max(128), deletedAtMs: epochMs })
  .strict();
