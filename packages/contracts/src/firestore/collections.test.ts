import { describe, expect, it } from "vitest";
import { deletionLogEntrySchema, OWNER_COLLECTIONS, userProfileSchema } from "./collections";

const base = {
  decision: {
    id: "d1",
    outcome: "autoPost",
    rule: "deterministicClear",
    configVersion: 1,
    aiAutoPostThresholdBp: 10001,
    confidenceBp: 10000,
    evidenceFields: ["amount"],
    retriedAfterUnknown: false,
    sourceEventIds: ["s1"],
    createdAtMs: 1,
  },
};

const valid = {
  accounts: {
    id: "a1",
    kind: "bank",
    name: "City",
    currency: "BDT",
    status: "active",
    createdAtMs: 1,
  },
  paymentInstruments: {
    id: "p1",
    kind: "debitCard",
    provider: "ucb",
    maskedIdentifier: "1234",
    linkedAccountId: "a1",
    status: "active",
    createdAtMs: 1,
  },
  sourceEvents: {
    id: "s1",
    sourceType: "sms",
    sourceHash: "h",
    idempotencyKey: "k",
    status: "received",
    stageAttempt: 0,
    claim: null,
    parkedStage: null,
    version: 0,
    receivedAtMs: 1,
    terminalAtMs: null,
    providerResultsPurged: false,
    retainedText: "Tk 100 paid",
    candidate: null,
    extraction: null,
    matchedTransactionId: null,
    resolvedAccountId: null,
    userConfirmed: false,
  },
  providerCalls: {
    id: "c1",
    sourceEventId: "s1",
    stage: "interpret",
    providerId: "deepseek",
    retrySafety: "none",
    state: "started",
    requestKey: "rk",
    attemptCount: 1,
    userApprovedRetry: false,
    retriedAfterUnknown: false,
    updatedAtMs: 1,
  },
  transactions: {
    id: "t1",
    state: "posted",
    intentType: "adjustment",
    occurredAtMs: 1,
    currency: "BDT",
    sourceEventIds: [],
    actor: "user",
    committedAtMs: 1,
    auditDetails: { cause: "miscount", authorizedBy: "Mabrur" },
  },
  ledgerEntries: {
    id: "t1:0",
    transactionId: "t1",
    accountId: "a1",
    accountKind: "bank",
    side: "debit",
    amountMinor: 100,
    currency: "BDT",
    occurredAtMs: 1,
  },
  balances: {
    accountId: "a1",
    accountKind: "creditLiability",
    currency: "BDT",
    debitMinusCreditMinor: -100,
    version: 1,
    updatedAtMs: 1,
  },
  idempotencyRecords: { key: "k", payloadHash: "h", createdAtMs: 1 },
  cutoverMarkers: { accountId: "a1", effectiveAtMs: 1, transactionId: "t1" },
  decisionRecords: {
    ...base.decision,
    source: "deterministicParser",
    parser: { name: "bkash", version: "1" },
  },
  cashAllocations: {
    id: "ca1",
    walletAccountId: "a2",
    purpose: "groceries",
    currency: "BDT",
    allocatedMinor: 500,
    remainingMinor: 500,
    status: "active",
    history: [],
    createdAtMs: 1,
    updatedAtMs: 1,
  },
  reconciliations: {
    id: "r1",
    accountId: "a2",
    kind: "cashCount",
    currency: "BDT",
    asOfMs: 1,
    statedBalanceMinor: 90,
    expectedBalanceMinor: 100,
    differenceMinor: -10,
    reviewStatus: "open",
    adjustmentTransactionIds: [],
    createdAtMs: 1,
    updatedAtMs: 1,
  },
  followUps: {
    id: "f1",
    trigger: "withdrawalDestination",
    question: "Where did the cash go?",
    dueAtMs: 1,
    snoozedUntilMs: null,
    state: "open",
    createdAtMs: 1,
    resolvedAtMs: null,
  },
  conversations: { id: "cv1", createdAtMs: 1, updatedAtMs: 1, expiresAtMs: 2 },
  conversationMessages: {
    id: "m1",
    conversationId: "cv1",
    role: "user",
    text: "hi",
    evidenceSourceEventIds: [],
    approvedOperationIds: [],
    createdAtMs: 1,
    expiresAtMs: 2,
  },
  aiUsage: {
    id: "u1",
    providerId: "deepseek",
    estimatedMicroUsd: 10,
    outcome: "success",
    userApprovedRetry: false,
    sourceEventId: "s1",
    stage: "interpret",
    attempt: 1,
    createdAtMs: 1,
  },
  quotaCounters: { window: "2026-11", reservedMicroUsd: 0, warnedAtMs: null, updatedAtMs: 1 },
  temporaryUploads: {
    id: "tu1",
    storagePath: "uploads/x",
    mimeType: "image/jpeg",
    sizeBytes: 10,
    state: "uploaded",
    createdAtMs: 1,
    expiresAtMs: 2,
    deletionAttempts: 0,
    deletionVerifiedAtMs: null,
  },
  consents: { id: "co1", kind: "aiProcessing", policyVersion: 1, granted: true, decidedAtMs: 1 },
  deletionJobs: {
    id: "dj1",
    state: "requested",
    attemptCount: 0,
    requestedAtMs: 1,
    updatedAtMs: 1,
    completedAtMs: null,
  },
} as const;

describe("owner collection schemas", () => {
  it("has a valid fixture for every collection", () => {
    expect(Object.keys(valid).sort()).toEqual(Object.keys(OWNER_COLLECTIONS).sort());
  });
  it.each(Object.entries(valid))(
    "%s accepts a valid document and rejects unknown fields",
    (name, doc) => {
      const schema = OWNER_COLLECTIONS[name as keyof typeof OWNER_COLLECTIONS];
      expect(schema.safeParse(doc).success).toBe(true);
      expect(schema.safeParse({ ...doc, extra: 1 }).success).toBe(false);
    },
  );
  it("rejects a malformed ledger amount, zero included", () => {
    for (const amountMinor of [12.5, "100", 0, -5, 2 ** 53]) {
      expect(
        OWNER_COLLECTIONS.ledgerEntries.safeParse({ ...valid.ledgerEntries, amountMinor }).success,
      ).toBe(false);
    }
  });
  it("accepts a negative signed balance", () => {
    expect(OWNER_COLLECTIONS.balances.safeParse(valid.balances).success).toBe(true);
  });
  it("rejects unknown fields inside nested objects", () => {
    expect(
      OWNER_COLLECTIONS.transactions.safeParse({
        ...valid.transactions,
        auditDetails: { cause: "x", extra: 1 },
      }).success,
    ).toBe(false);
  });
  it("decision records require the variant's provenance", () => {
    const noParser: Record<string, unknown> = { ...valid.decisionRecords };
    delete noParser.parser;
    expect(OWNER_COLLECTIONS.decisionRecords.safeParse(noParser).success).toBe(false);
    expect(OWNER_COLLECTIONS.decisionRecords.safeParse({ ...noParser, source: "ai" }).success).toBe(
      false,
    );
    expect(
      OWNER_COLLECTIONS.decisionRecords.safeParse({
        ...noParser,
        source: "ai",
        ai: { model: "m", promptVersion: "v1" },
      }).success,
    ).toBe(true);
    expect(
      OWNER_COLLECTIONS.decisionRecords.safeParse({
        ...valid.decisionRecords,
        ai: { model: "m", promptVersion: "v1" },
      }).success,
    ).toBe(false);
  });
  it("rejects confidence above 10000", () => {
    expect(
      OWNER_COLLECTIONS.decisionRecords.safeParse({ ...valid.decisionRecords, confidenceBp: 10001 })
        .success,
    ).toBe(false);
  });
  it("user profile and deletion log entries parse and are strict", () => {
    const profile = {
      baseCurrency: "BDT",
      timezone: "Asia/Dhaka",
      reportingCycle: { kind: "salaryCycle", startDay: 25 },
      notifications: { digestLocalTime: "20:00", frequency: "daily", minThresholdMinor: 0 },
      retentionPolicyVersion: 1,
      createdAtMs: 1,
    };
    expect(userProfileSchema.safeParse(profile).success).toBe(true);
    expect(userProfileSchema.safeParse({ ...profile, extra: 1 }).success).toBe(false);
    const entry = { ownerIdHash: "abc", deletedAtMs: 1 };
    expect(deletionLogEntrySchema.safeParse(entry).success).toBe(true);
    expect(deletionLogEntrySchema.safeParse({ ...entry, uid: "x" }).success).toBe(false);
  });
});
