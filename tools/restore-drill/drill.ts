import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  OWNER_COLLECTIONS,
  OWNER_DATA_REGISTRY,
  type OwnerCollectionName,
} from "@moneytrace/contracts";
import { asAccountId, asOwnerId, Money } from "@moneytrace/domain";
import { composeDeps } from "../../apps/functions/src/composition";
import { ownerPath } from "@moneytrace/infrastructure";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { dataChecksum, diffChecksums, type DataChecksum } from "./checksum";

const OWNER = "restore-drill";
const ACCOUNT = "restore-bank";
const PROJECT_DEFAULT = "demo-moneytrace";

const FIXED: Partial<Record<OwnerCollectionName, Record<string, unknown>>> = {
  paymentInstruments: {
    id: "restore-card",
    kind: "debitCard",
    provider: "ucb",
    maskedIdentifier: "1234",
    linkedAccountId: ACCOUNT,
    status: "active",
    createdAtMs: 1_700_000_000_000,
  },
  sourceEvents: {
    id: "restore-source",
    sourceType: "sms",
    sourceHash: "restore-hash",
    idempotencyKey: "restore-source-key",
    status: "received",
    stageAttempt: 0,
    claim: null,
    parkedStage: null,
    version: 0,
    receivedAtMs: 1_700_000_000_000,
    terminalAtMs: null,
    providerResultsPurged: false,
    retainedText: "masked evidence",
    candidate: null,
    extraction: null,
    matchedTransactionId: null,
    resolvedAccountId: null,
    userConfirmed: false,
  },
  providerCalls: {
    id: "restore-call",
    sourceEventId: "restore-source",
    stage: "interpret",
    providerId: "restore",
    retrySafety: "localPure",
    state: "succeeded",
    requestKey: "restore-request",
    attemptCount: 1,
    userApprovedRetry: false,
    retriedAfterUnknown: false,
    result: { amountMinor: 100 },
    updatedAtMs: 1_700_000_000_000,
  },
  idempotencyRecords: {
    key: "restore-source-key",
    payloadHash: "restore-payload",
    createdAtMs: 1_700_000_000_000,
  },
  cutoverMarkers: {
    accountId: ACCOUNT,
    effectiveAtMs: 1_700_000_000_000,
    transactionId: `opening-${ACCOUNT}`,
  },
  decisionRecords: {
    id: "restore-decision",
    source: "deterministicParser",
    parser: { name: "restore", version: "1" },
    outcome: "autoPost",
    rule: "restore",
    configVersion: 1,
    aiAutoPostThresholdBp: 10001,
    confidenceBp: 10000,
    evidenceFields: ["amount"],
    retriedAfterUnknown: false,
    sourceEventIds: ["restore-source"],
    createdAtMs: 1_700_000_000_000,
  },
  cashAllocations: {
    id: "restore-allocation",
    walletAccountId: ACCOUNT,
    purpose: "restore",
    currency: "BDT",
    allocatedMinor: 100,
    remainingMinor: 100,
    status: "active",
    history: [],
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_000,
  },
  reconciliations: {
    id: "restore-reconciliation",
    accountId: ACCOUNT,
    kind: "statement",
    currency: "BDT",
    asOfMs: 1_700_000_000_000,
    statedBalanceMinor: 100,
    expectedBalanceMinor: 100,
    differenceMinor: 0,
    reviewStatus: "reviewed",
    adjustmentTransactionIds: [],
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_000,
  },
  followUps: {
    id: "restore-follow-up",
    trigger: "withdrawalDestination",
    question: "Restore question",
    dueAtMs: 1_700_000_000_000,
    snoozedUntilMs: null,
    state: "resolved",
    resolution: "restore",
    createdAtMs: 1_700_000_000_000,
    resolvedAtMs: 1_700_000_000_000,
  },
  conversations: {
    id: "restore-conversation",
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_000,
    expiresAtMs: 1_700_000_100_000,
  },
  conversationMessages: {
    id: "restore-message",
    conversationId: "restore-conversation",
    role: "user",
    text: "restore",
    evidenceSourceEventIds: [],
    approvedOperationIds: [],
    createdAtMs: 1_700_000_000_000,
    expiresAtMs: 1_700_000_100_000,
  },
  aiUsage: {
    id: "restore-usage",
    providerId: "restore",
    estimatedMicroUsd: 1,
    outcome: "success",
    userApprovedRetry: false,
    sourceEventId: "restore-source",
    stage: "interpret",
    attempt: 1,
    createdAtMs: 1_700_000_000_000,
  },
  quotaCounters: {
    window: "2026-11",
    reservedMicroUsd: 1,
    warnedAtMs: null,
    updatedAtMs: 1_700_000_000_000,
  },
  temporaryUploads: {
    id: "restore-upload",
    storagePath: "uploads/restore",
    mimeType: "image/jpeg",
    sizeBytes: 1,
    state: "deleted",
    createdAtMs: 1_700_000_000_000,
    expiresAtMs: 1_700_000_100_000,
    deletionAttempts: 1,
    deletionVerifiedAtMs: 1_700_000_000_000,
  },
  consents: {
    id: "restore-consent",
    kind: "retentionPolicy",
    policyVersion: 1,
    granted: true,
    decidedAtMs: 1_700_000_000_000,
  },
  deletionJobs: {
    id: "restore-deletion",
    state: "completed",
    attemptCount: 1,
    requestedAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_000,
    completedAtMs: 1_700_000_000_000,
  },
};

function argument(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
}

export function assertAllowedProject(projectId: string): void {
  if (projectId !== PROJECT_DEFAULT && !projectId.endsWith("-staging")) {
    throw new Error(
      `refusing project ${projectId}; use demo-moneytrace or a project ending in -staging`,
    );
  }
}

function firestore(projectId: string, databaseId = "(default)"): Firestore {
  const app = getApps()[0] ?? initializeApp({ projectId });
  return databaseId === "(default)" ? getFirestore(app) : getFirestore(app, databaseId);
}

function documentId(name: OwnerCollectionName, data: Record<string, unknown>): string {
  if (name === "balances") return String(data["accountId"]);
  if (name === "idempotencyRecords") return String(data["key"]);
  if (name === "quotaCounters") return String(data["window"]);
  return String(data["id"]);
}

async function seed(projectId: string): Promise<void> {
  const db = firestore(projectId);
  const owner = asOwnerId(OWNER);
  const deps = composeDeps(db);
  await deps.bootstrapUser.execute({ ownerId: owner });
  await db
    .doc("deletionLog/restore-drill")
    .set({ ownerIdHash: "restore-owner", deletedAtMs: 1_700_000_000_000 });
  await db
    .doc(ownerPath(OWNER, "accounts", ACCOUNT))
    .set({
      id: ACCOUNT,
      kind: "bank",
      name: "Restore bank",
      currency: "BDT",
      status: "active",
      createdAtMs: 1_700_000_000_000,
    });
  await deps.recordOpeningBalance.execute({
    ownerId: owner,
    accountId: asAccountId(ACCOUNT),
    amount: Money.ofMinor(100, "BDT"),
    effectiveAtMs: 1_700_000_000_000,
    actor: OWNER,
  });

  for (const name of Object.keys(OWNER_DATA_REGISTRY) as OwnerCollectionName[]) {
    if (
      name === "accounts" ||
      name === "transactions" ||
      name === "ledgerEntries" ||
      name === "balances"
    )
      continue;
    const raw = FIXED[name];
    if (raw === undefined) throw new Error(`no restore fixture for ${name}`);
    const data = OWNER_COLLECTIONS[name].parse(raw) as Record<string, unknown>;
    await db.doc(ownerPath(OWNER, name, documentId(name, data))).set(data);
  }
  const sum = await dataChecksum(db, OWNER);
  for (const name of Object.keys(OWNER_DATA_REGISTRY) as OwnerCollectionName[]) {
    if (sum.collections[name].count === 0) throw new Error(`restore seed missing ${name}`);
  }
  const expected = argument("expected", "drill-expected.json");
  if (expected === undefined) throw new Error("--expected is required");
  await writeFile(expected, `${JSON.stringify(sum, null, 2)}\n`);
  console.log(`seeded ${OWNER}; checksum written to ${expected}`);
}

async function verify(projectId: string, databaseId: string): Promise<void> {
  const expectedPath = argument("expected", "drill-expected.json");
  if (expectedPath === undefined) throw new Error("--expected is required");
  const expected = JSON.parse(await readFile(expectedPath, "utf8")) as DataChecksum;
  const db = firestore(projectId, databaseId);
  const actual = await dataChecksum(db, OWNER);
  const differences = diffChecksums(expected, actual);
  const entries = await db.collection(ownerPath(OWNER, "ledgerEntries")).get();
  const totals = new Map<string, number>();
  for (const entry of entries.docs) {
    const data = entry.data() as {
      accountId: string;
      side: "debit" | "credit";
      amountMinor: number;
    };
    const sign = data.side === "debit" ? 1 : -1;
    totals.set(data.accountId, (totals.get(data.accountId) ?? 0) + sign * data.amountMinor);
  }
  const balances = await db.collection(ownerPath(OWNER, "balances")).get();
  for (const balance of balances.docs) {
    const data = balance.data() as { accountId: string; debitMinusCreditMinor: number };
    if (totals.get(data.accountId) !== data.debitMinusCreditMinor)
      differences.push(`balance:${data.accountId}`);
  }
  console.log(
    differences.length === 0 ? "checksum match" : `differences: ${differences.join(", ")}`,
  );
  if (differences.length > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  const projectId = argument("project", PROJECT_DEFAULT) as string;
  assertAllowedProject(projectId);
  if (command === "seed") await seed(projectId);
  else if (command === "verify")
    await verify(projectId, argument("database", "(default)") as string);
  else
    throw new Error(
      "usage: drill seed|verify --project <demo-moneytrace|*-staging> --expected <path>",
    );
}
