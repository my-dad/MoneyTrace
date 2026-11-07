/** @vitest-environment node */

import { OWNER_COLLECTIONS, OWNER_DATA_REGISTRY, type OwnerCollectionName } from "@moneytrace/contracts";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { dataChecksum, diffChecksums } from "./checksum";

const PROJECT_ID = "demo-moneytrace";
const OWNER = "restore-drill";
const PROFILE = {
  baseCurrency: "BDT",
  timezone: "Asia/Dhaka",
  reportingCycle: { kind: "calendarMonth" },
  notifications: { digestLocalTime: "20:00", frequency: "daily", minThresholdMinor: 0 },
  retentionPolicyVersion: 1,
  createdAtMs: 1_700_000_000_000,
};
const VALID: Record<OwnerCollectionName, Record<string, unknown>> = {
  accounts: { id: "bank-1", kind: "bank", name: "Restore bank", currency: "BDT", status: "active", createdAtMs: 1 },
  paymentInstruments: { id: "card-1", kind: "debitCard", maskedIdentifier: "1234", linkedAccountId: "bank-1", status: "active", createdAtMs: 1 },
  sourceEvents: { id: "source-1", sourceType: "sms", sourceHash: "restore-hash", idempotencyKey: "restore-key", status: "received", stageAttempt: 0, claim: null, parkedStage: null, version: 0, receivedAtMs: 1, terminalAtMs: null, providerResultsPurged: false, retainedText: "masked evidence", candidate: null, extraction: null, matchedTransactionId: null, resolvedAccountId: null, userConfirmed: false },
  providerCalls: { id: "call-1", sourceEventId: "source-1", stage: "interpret", providerId: "restore", retrySafety: "localPure", state: "succeeded", requestKey: "restore-request", attemptCount: 1, userApprovedRetry: false, retriedAfterUnknown: false, result: { amountMinor: 1 }, updatedAtMs: 1 },
  transactions: { id: "restore-tx", state: "posted", intentType: "openingBalance", occurredAtMs: 1, currency: "BDT", sourceEventIds: [], actor: "restore-drill", committedAtMs: 1 },
  ledgerEntries: { id: "restore-tx:0", transactionId: "restore-tx", accountId: "bank-1", accountKind: "bank", side: "debit", amountMinor: 1, currency: "BDT", occurredAtMs: 1 },
  balances: { accountId: "bank-1", accountKind: "bank", currency: "BDT", debitMinusCreditMinor: 1, version: 1, updatedAtMs: 1 },
  idempotencyRecords: { key: "restore-key", payloadHash: "restore-payload", createdAtMs: 1 },
  cutoverMarkers: { accountId: "bank-1", effectiveAtMs: 1, transactionId: "restore-tx" },
  decisionRecords: { id: "decision-1", source: "deterministicParser", parser: { name: "restore", version: "1" }, outcome: "autoPost", rule: "restore", configVersion: 1, aiAutoPostThresholdBp: 10001, confidenceBp: 10000, evidenceFields: ["amount"], retriedAfterUnknown: false, sourceEventIds: ["source-1"], createdAtMs: 1 },
  cashAllocations: { id: "allocation-1", walletAccountId: "bank-1", purpose: "restore", currency: "BDT", allocatedMinor: 1, remainingMinor: 1, status: "active", history: [], createdAtMs: 1, updatedAtMs: 1 },
  reconciliations: { id: "reconciliation-1", accountId: "bank-1", kind: "statement", currency: "BDT", asOfMs: 1, statedBalanceMinor: 1, expectedBalanceMinor: 1, differenceMinor: 0, reviewStatus: "reviewed", adjustmentTransactionIds: [], createdAtMs: 1, updatedAtMs: 1 },
  followUps: { id: "follow-up-1", trigger: "withdrawalDestination", question: "Restore question", dueAtMs: 1, snoozedUntilMs: null, state: "resolved", resolution: "restore", createdAtMs: 1, resolvedAtMs: 1 },
  conversations: { id: "conversation-1", createdAtMs: 1, updatedAtMs: 1, expiresAtMs: 2 },
  conversationMessages: { id: "message-1", conversationId: "conversation-1", role: "user", text: "restore", evidenceSourceEventIds: [], approvedOperationIds: [], createdAtMs: 1, expiresAtMs: 2 },
  aiUsage: { id: "usage-1", providerId: "restore", estimatedMicroUsd: 1, outcome: "success", userApprovedRetry: false, sourceEventId: "source-1", stage: "interpret", attempt: 1, createdAtMs: 1 },
  quotaCounters: { window: "2026-11", reservedMicroUsd: 1, warnedAtMs: null, updatedAtMs: 1 },
  temporaryUploads: { id: "upload-1", storagePath: "uploads/restore", mimeType: "image/jpeg", sizeBytes: 1, state: "deleted", createdAtMs: 1, expiresAtMs: 2, deletionAttempts: 1, deletionVerifiedAtMs: 1 },
  consents: { id: "consent-1", kind: "retentionPolicy", policyVersion: 1, granted: true, decidedAtMs: 1 },
  deletionJobs: { id: "deletion-1", state: "completed", attemptCount: 1, requestedAtMs: 1, updatedAtMs: 1, completedAtMs: 1 },
};

const db: Firestore = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));

async function clear(): Promise<void> {
  const host = process.env["FIRESTORE_EMULATOR_HOST"];
  if (host === undefined) throw new Error("run through `firebase emulators:exec`");
  const response = await fetch(`http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
  if (!response.ok) throw new Error(`could not clear emulator: ${String(response.status)}`);
}

async function seed(): Promise<void> {
  await db.doc(`users/${OWNER}`).set(PROFILE);
  await db.doc("deletionLog/restore-drill").set({ ownerIdHash: "restore-owner", deletedAtMs: 1 });
  for (const name of Object.keys(OWNER_DATA_REGISTRY) as OwnerCollectionName[]) {
    const document = OWNER_COLLECTIONS[name].parse(VALID[name]);
    const docId = name === "balances"
      ? String(VALID[name]["accountId"])
      : name === "idempotencyRecords"
        ? String(VALID[name]["key"])
        : name === "quotaCounters"
          ? String(VALID[name]["window"])
          : String(VALID[name]["id"]);
    await db.doc(`users/${OWNER}/${name}/${docId}`).set(document);
  }
}

async function deleteOne(name: OwnerCollectionName): Promise<void> {
  const snapshot = await db.collection(`users/${OWNER}/${name}`).limit(1).get();
  const first = snapshot.docs[0];
  if (first === undefined) throw new Error(`no document to delete in ${name}`);
  await first.ref.delete();
}

beforeEach(clear);

describe("restore checksum", () => {
  it("seeds at least one valid document in every registered collection", async () => {
    await seed();
    const sum = await dataChecksum(db, OWNER);
    for (const name of Object.keys(OWNER_DATA_REGISTRY) as OwnerCollectionName[]) {
      expect(sum.collections[name].count, name).toBeGreaterThan(0);
    }
  });

  it.each(Object.keys(OWNER_DATA_REGISTRY) as OwnerCollectionName[])("detects a lost document in %s", async (name) => {
    await seed();
    const expected = await dataChecksum(db, OWNER);
    await deleteOne(name);
    expect(diffChecksums(expected, await dataChecksum(db, OWNER))).toEqual([name]);
  });

  it.each(Object.keys(OWNER_DATA_REGISTRY) as OwnerCollectionName[])("detects a changed field in %s", async (name) => {
    await seed();
    const expected = await dataChecksum(db, OWNER);
    const snapshot = await db.collection(`users/${OWNER}/${name}`).limit(1).get();
    const first = snapshot.docs[0];
    if (first === undefined) throw new Error(`no document to update in ${name}`);
    await first.ref.set({ changedByDrill: true }, { merge: true });
    expect(diffChecksums(expected, await dataChecksum(db, OWNER))).toEqual([name]);
  });

  it("detects a lost profile and a lost deletion-log entry", async () => {
    await seed();
    const expected = await dataChecksum(db, OWNER);
    await db.doc(`users/${OWNER}`).delete();
    await db.doc("deletionLog/restore-drill").delete();
    expect(diffChecksums(expected, await dataChecksum(db, OWNER))).toEqual(["profile", "deletionLog"]);
  });

  it("the same data gives an identical checksum", async () => {
    await seed();
    expect(await dataChecksum(db, OWNER)).toEqual(await dataChecksum(db, OWNER));
  });
});
