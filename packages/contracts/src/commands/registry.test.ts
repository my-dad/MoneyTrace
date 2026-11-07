import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TRIGGERS } from "../triggers";
import { COMMANDS, type CommandName } from "./registry";

const validOpening = {
  accountId: "acc1",
  amountMinor: 100000,
  currency: "BDT",
  effectiveAtMs: 1700000000000,
};

const EXAMPLES: Record<CommandName, unknown> = {
  bootstrapUser: {},
  createAccount: { kind: "bank", name: "City Bank", currency: "BDT" },
  recordOpeningBalance: validOpening,
  createPaymentInstrument: {
    accountId: "acc1",
    provider: "ucb",
    maskedIdentifier: "1234",
    type: "debitCard",
  },
  updateSettings: { reportingCycle: { kind: "salaryCycle", startDay: 25 } },
  submitEvidence: { idempotencyKey: "k1", text: "Tk 500 debited at ATM" },
  sendChatMessage: { conversationId: "conv1", text: "I gave 2000 cash to Mom" },
  confirmCandidate: { sourceEventId: "se1", decision: "confirm" },
  resolveFollowUp: { followUpId: "f1", resolution: { kind: "answer", text: "groceries" } },
  snoozeFollowUp: { followUpId: "f1", untilMs: 1700000000000 },
  retrySourceEvent: { sourceEventId: "se1" },
  cancelSourceEvent: { sourceEventId: "se1" },
  correctTransaction: {
    idempotencyKey: "k2",
    transactionId: "t1",
    replacement: { amountMinor: 450, currency: "BDT" },
    rationale: "wrong amount",
  },
  recordCustodyTransfer: {
    idempotencyKey: "k3",
    fromAccountId: "acc1",
    toAccountId: "acc2",
    amountMinor: 2000,
    currency: "BDT",
    holderName: "Mom",
  },
  upsertCashAllocation: {
    walletId: "acc2",
    purpose: "groceries",
    amountMinor: 5000,
    currency: "BDT",
  },
  createUploadSession: { mimeType: "image/jpeg", sizeBytes: 1024 },
  finalizeUpload: { uploadId: "u1", idempotencyKey: "k4" },
  setOcrConsent: { consentVersion: 1, granted: true },
  recordReconciliation: {
    accountId: "acc1",
    countedMinor: 900,
    currency: "BDT",
    countedAtMs: 1700000000000,
  },
  recordAdjustment: {
    idempotencyKey: "k5",
    accountId: "acc1",
    direction: "decrease",
    amountMinor: 100,
    currency: "BDT",
    cause: "lost note",
  },
  requestExport: {},
  requestAccountDeletion: { confirmation: "DELETE MY ACCOUNT" },
};

function validRequest(name: string): Record<string, unknown> {
  const example = (EXAMPLES as Record<string, unknown>)[name];
  if (example === undefined) throw new Error(`no valid example for command ${name}`);
  return example as Record<string, unknown>;
}

const RESPONSES: Record<CommandName, Record<string, unknown>> = {
  bootstrapUser: { created: true },
  createAccount: { accountId: "a" },
  recordOpeningBalance: { transactionId: "t", status: "recorded" },
  createPaymentInstrument: { instrumentId: "i" },
  updateSettings: { updated: true },
  submitEvidence: { sourceEventId: "s", status: "received", duplicate: false },
  sendChatMessage: { messageId: "m", status: "accepted" },
  confirmCandidate: { status: "recorded", transactionId: "t" },
  resolveFollowUp: { state: "resolved" },
  snoozeFollowUp: { state: "snoozed" },
  retrySourceEvent: { status: "received" },
  cancelSourceEvent: { status: "cancelled" },
  correctTransaction: { reversalTransactionId: "r", status: "recorded" },
  recordCustodyTransfer: { transactionId: "t", status: "recorded" },
  upsertCashAllocation: { allocationId: "a" },
  createUploadSession: { uploadId: "u", uploadPath: "p", expiresAtMs: 1 },
  finalizeUpload: { sourceEventId: "s", duplicate: false },
  setOcrConsent: { granted: true },
  recordReconciliation: { reconciliationId: "r", differenceMinor: -5 },
  recordAdjustment: { transactionId: "t", status: "recorded" },
  requestExport: { requestId: "r" },
  requestAccountDeletion: { requestId: "r" },
};

function validResponse(name: string): Record<string, unknown> {
  const example = (RESPONSES as Record<string, Record<string, unknown>>)[name];
  if (example === undefined) throw new Error(`no valid response example for command ${name}`);
  return example;
}

function docHeadings(): string[] {
  const path = fileURLToPath(
    new URL("../../../../docs/architecture/function-contracts.md", import.meta.url),
  );
  return [...readFileSync(path, "utf8").matchAll(/^### (\S+)\s*$/gm)].map((m) => m[1] as string);
}

const names = Object.keys(COMMANDS);

describe("COMMANDS", () => {
  it("has an example for every command and none extra", () => {
    expect(Object.keys(EXAMPLES).sort()).toEqual([...names].sort());
    expect(names.length).toBe(22);
  });
  it.each(names)("%s accepts its valid example", (name) => {
    const c = COMMANDS[name as CommandName];
    expect(c.request.safeParse(validRequest(name)).success).toBe(true);
  });
  it("every command has strict request and response schemas", () => {
    for (const [name, c] of Object.entries(COMMANDS)) {
      expect(c.request.safeParse({ ...validRequest(name), injected: 1 }).success, name).toBe(false);
      const res = validResponse(name);
      expect(c.response.safeParse(res).success, `${name} valid response`).toBe(true);
      expect(c.response.safeParse({ ...res, injected: 1 }).success, `${name} response`).toBe(false);
    }
  });
  it.each(names)("%s has no ownerId in its request", (name) => {
    const c = COMMANDS[name as CommandName];
    expect(c.request.safeParse({ ...validRequest(name), ownerId: "someone" }).success).toBe(false);
  });
  it.each([12.5, "100", NaN, 2 ** 53, Infinity])(
    "recordOpeningBalance rejects amount %s",
    (amountMinor) => {
      expect(
        COMMANDS.recordOpeningBalance.request.safeParse({ ...validOpening, amountMinor }).success,
      ).toBe(false);
    },
  );
  it.each([-5000, 0])("recordOpeningBalance accepts signed amount %s", (amountMinor) => {
    expect(
      COMMANDS.recordOpeningBalance.request.safeParse({ ...validOpening, amountMinor }).success,
    ).toBe(true);
  });
  it("rejects malformed amounts on every other money-bearing command", () => {
    const moneyFields: Array<[CommandName, string]> = [
      ["recordCustodyTransfer", "amountMinor"],
      ["upsertCashAllocation", "amountMinor"],
      ["recordReconciliation", "countedMinor"],
      ["recordAdjustment", "amountMinor"],
    ];
    for (const [name, field] of moneyFields) {
      for (const bad of [12.5, "100", NaN, 2 ** 53, 0]) {
        const req = { ...validRequest(name), [field]: bad };
        expect(
          COMMANDS[name].request.safeParse(req).success,
          `${name}.${field}=${String(bad)}`,
        ).toBe(field === "countedMinor" && bad === 0);
      }
    }
  });
  it("rejects unsupported currency and oversize text", () => {
    expect(
      COMMANDS.recordOpeningBalance.request.safeParse({ ...validOpening, currency: "USD" }).success,
    ).toBe(false);
    expect(
      COMMANDS.submitEvidence.request.safeParse({ idempotencyKey: "k", text: "x".repeat(10001) })
        .success,
    ).toBe(false);
    expect(
      COMMANDS.submitEvidence.request.safeParse({ idempotencyKey: "k", text: "x".repeat(10000) })
        .success,
    ).toBe(true);
  });
  it("enforces upload limits", () => {
    const up = COMMANDS.createUploadSession.request;
    expect(up.safeParse({ mimeType: "image/gif", sizeBytes: 10 }).success).toBe(false);
    expect(up.safeParse({ mimeType: "application/pdf", sizeBytes: 10 * 1024 * 1024 }).success).toBe(
      true,
    );
    expect(
      up.safeParse({ mimeType: "application/pdf", sizeBytes: 10 * 1024 * 1024 + 1 }).success,
    ).toBe(false);
    expect(up.safeParse({ mimeType: "application/pdf", sizeBytes: 0 }).success).toBe(false);
  });
  it("task 12 response shapes", () => {
    expect(COMMANDS.createAccount.response.safeParse({ accountId: "a" }).success).toBe(true);
    expect(
      COMMANDS.recordOpeningBalance.response.safeParse({
        transactionId: "t",
        status: "alreadyRecorded",
      }).success,
    ).toBe(true);
    expect(
      COMMANDS.recordOpeningBalance.response.safeParse({ transactionId: "t", status: "pending" })
        .success,
    ).toBe(false);
    expect(COMMANDS.bootstrapUser.response.safeParse({ created: true }).success).toBe(true);
    expect(COMMANDS.bootstrapUser.response.safeParse({ created: true, x: 1 }).success).toBe(false);
  });
});

describe("TRIGGERS", () => {
  it("defines the six triggers", () => {
    expect(Object.keys(TRIGGERS).sort()).toEqual(
      [
        "dispatchFollowUps",
        "onSourceEventWritten",
        "purgeProviderResults",
        "recoverExpiredClaims",
        "resumeQuotaBlockedEvents",
        "sweepAbandonedUploads",
      ].sort(),
    );
    expect(TRIGGERS.onSourceEventWritten.kind).toBe("firestore");
    expect(TRIGGERS.onSourceEventWritten.source).toBe("users/{uid}/sourceEvents/{id}");
    expect(TRIGGERS.recoverExpiredClaims).toMatchObject({
      kind: "schedule",
      source: "every 5 minutes",
    });
  });
});

describe("function-contracts.md", () => {
  it("documents every command and trigger, and nothing else", () => {
    expect(docHeadings().sort()).toEqual([...names, ...Object.keys(TRIGGERS)].sort());
  });
});
