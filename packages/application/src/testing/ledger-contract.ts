import { beforeEach, describe, expect, it } from "vitest";
import {
  LedgerDate,
  Money,
  asAccountId,
  asIdempotencyKey,
  asOwnerId,
  asTransactionId,
  type AccountRef,
  type EntryDraft,
  type TransactionId,
} from "@moneytrace/domain";
import type { AccountRepository } from "../ports/account-repository";
import type { LedgerReader, TransactionRecord } from "../ports/ledger-reader";
import type {
  CorrectionCommit,
  LedgerCommit,
  LedgerCommitResult,
  LedgerWriter,
} from "../ports/ledger-writer";

export type LedgerHarness = {
  writer: LedgerWriter;
  reader: LedgerReader;
  accounts: AccountRepository;
};

const alice = asOwnerId("alice");
const bob = asOwnerId("bob");
const bank: AccountRef = { id: asAccountId("bank-1"), kind: "bank", currency: "BDT" };
const cash: AccountRef = { id: asAccountId("cash-1"), kind: "cash", currency: "BDT" };
const bdt = (n: number): Money => Money.ofMinor(n, "BDT");
const code = (c: string): Error => expect.objectContaining({ code: c }) as Error;

const withdrawal = (n: number): EntryDraft[] => [
  { account: cash, side: "debit", amount: bdt(n) },
  { account: bank, side: "credit", amount: bdt(n) },
];

const record = (id: string, extra: Partial<TransactionRecord> = {}): TransactionRecord => ({
  id: asTransactionId(id),
  state: "posted",
  intentType: "withdrawal",
  occurredAtMs: 1_700_000_000_000,
  currency: "BDT",
  sourceEventIds: [],
  actor: "user",
  committedAtMs: 1_700_000_000_500,
  ...extra,
});

const commitOf = (
  key: string,
  txId: string,
  amount: number,
  hash = `hash-${key}`,
): LedgerCommit => ({
  idempotencyKey: asIdempotencyKey(key),
  payloadHash: hash,
  transaction: record(txId),
  entries: withdrawal(amount),
});

const correctionOf = (
  key: string,
  original: string,
  replacementAmount: number | null,
): CorrectionCommit => ({
  idempotencyKey: asIdempotencyKey(key),
  payloadHash: `hash-${key}`,
  originalTransactionId: asTransactionId(original),
  reversal: record(`${original}:rev:${key}`, {
    correctionOf: asTransactionId(original),
    rationale: "typo",
  }),
  reversalEntries: [
    { account: cash, side: "credit", amount: bdt(500_000) },
    { account: bank, side: "debit", amount: bdt(500_000) },
  ],
  ...(replacementAmount === null
    ? {}
    : {
        replacement: {
          transaction: record(`${original}:repl:${key}`, {
            correctionOf: asTransactionId(original),
          }),
          entries: withdrawal(replacementAmount),
        },
      }),
});

const markerCommit = (key: string, accountId: string, hash: string): LedgerCommit => ({
  idempotencyKey: asIdempotencyKey(key),
  payloadHash: hash,
  transaction: record(`marker-${key}`, { intentType: "openingBalance" }),
  entries: [],
  cutoverMarker: {
    accountId: asAccountId(accountId),
    effectiveAt: LedgerDate.fromEpochMs(1_699_000_000_000),
  },
});

const committedId = (r: LedgerCommitResult): TransactionId => {
  if (r.status !== "committed") throw new Error(`expected committed, got ${r.status}`);
  return r.transactionId;
};

/** Shared behavior every LedgerWriter, LedgerReader and AccountRepository pair must satisfy. */
export function describeLedgerContract(
  name: string,
  makeHarness: () => Promise<LedgerHarness>,
): void {
  describe(`${name} ledger contract`, () => {
    let writer: LedgerWriter;
    let reader: LedgerReader;
    let accounts: AccountRepository;

    beforeEach(async () => {
      ({ writer, reader, accounts } = await makeHarness());
    });

    it("commits entries and updates balances together", async () => {
      const commit = commitOf("k1", "tx-1", 500_000);
      expect(await writer.commit(alice, commit)).toEqual({
        status: "committed",
        transactionId: commit.transaction.id,
      });
      expect(await reader.getBalance(alice, bank.id)).toBe(-500_000);
      expect(await reader.getBalance(alice, cash.id)).toBe(500_000);
      const entries = await reader.getEntries(alice, commit.transaction.id);
      expect(entries.map((e) => [e.id, e.accountId, e.side, e.amountMinor])).toEqual([
        ["tx-1:1", "cash-1", "debit", 500_000],
        ["tx-1:2", "bank-1", "credit", 500_000],
      ]);
      expect((await reader.getTransaction(alice, commit.transaction.id))?.state).toBe("posted");
    });

    it("keeps audit details on the stored transaction", async () => {
      const commit = commitOf("k1", "tx-1", 100);
      await writer.commit(alice, {
        ...commit,
        transaction: record("tx-1", { auditDetails: { holderName: "Mother" } }),
      });
      expect((await reader.getTransaction(alice, asTransactionId("tx-1")))?.auditDetails).toEqual({
        holderName: "Mother",
      });
    });

    it("returns duplicate for a repeated key and payload, and moves balances once", async () => {
      const commit = commitOf("k1", "tx-1", 500_000);
      const first = await writer.commit(alice, commit);
      const again = await writer.commit(alice, commit);
      expect(again).toEqual({ status: "duplicate", transactionId: committedId(first) });
      expect(await reader.getBalance(alice, cash.id)).toBe(500_000);
    });

    it("returns idempotencyConflict for the same key with a different payload", async () => {
      const commit = commitOf("k1", "tx-1", 500_000);
      const otherCommit = commitOf("k2", "tx-2", 700_000);
      await writer.commit(alice, commit);
      const other = await writer.commit(alice, {
        ...otherCommit,
        idempotencyKey: commit.idempotencyKey,
      });
      expect(other).toEqual({ status: "idempotencyConflict" });
      expect(await reader.getEntries(alice, otherCommit.transaction.id)).toEqual([]);
      expect(await reader.getBalance(alice, cash.id)).toBe(500_000);
    });

    it("scopes idempotency and data by owner", async () => {
      const commit = commitOf("k1", "tx-1", 500_000);
      expect((await writer.commit(alice, commit)).status).toBe("committed");
      expect((await writer.commit(bob, commit)).status).toBe("committed");
      await writer.commit(bob, commitOf("k2", "tx-2", 100));
      expect(await reader.getBalance(alice, cash.id)).toBe(500_000);
      expect(await reader.getTransaction(alice, asTransactionId("tx-2"))).toBeNull();
    });

    it("a pending transaction has no entries and no balance effect", async () => {
      const pending = record("tx-p", { state: "pending" });
      await writer.savePending(alice, pending);
      expect((await reader.getTransaction(alice, pending.id))?.state).toBe("pending");
      expect(await reader.getEntries(alice, pending.id)).toEqual([]);
      expect(await reader.getBalance(alice, cash.id)).toBe(0);
    });

    it("posting a pending transaction reuses its id and counts once", async () => {
      await writer.savePending(alice, record("tx-p", { state: "pending" }));
      const commit = commitOf("k1", "tx-p", 250_000);
      expect((await writer.commit(alice, commit)).status).toBe("committed");
      expect((await reader.getTransaction(alice, commit.transaction.id))?.state).toBe("posted");
      expect(await reader.getBalance(alice, cash.id)).toBe(250_000);
      expect(await reader.getEntries(alice, commit.transaction.id)).toHaveLength(2);
    });

    it("rejects posting over an already posted transaction id", async () => {
      await writer.commit(alice, commitOf("k1", "tx-1", 100));
      await expect(writer.commit(alice, commitOf("k2", "tx-1", 100))).rejects.toThrow(
        code("invalidTransition"),
      );
      expect(await reader.getBalance(alice, cash.id)).toBe(100);
    });

    it("rejects an unbalanced commit and writes nothing", async () => {
      const bad: LedgerCommit = {
        ...commitOf("k1", "tx-1", 5),
        entries: [
          { account: cash, side: "debit", amount: bdt(5) },
          { account: bank, side: "credit", amount: bdt(4) },
        ],
      };
      await expect(writer.commit(alice, bad)).rejects.toThrow(code("unbalancedEntries"));
      expect(await reader.getTransaction(alice, bad.transaction.id)).toBeNull();
      expect(await reader.getBalance(alice, cash.id)).toBe(0);
      expect(await writer.commit(alice, { ...bad, entries: withdrawal(5) })).toEqual({
        status: "committed",
        transactionId: bad.transaction.id,
      });
    });

    it("rejects empty entries without a cutover marker", async () => {
      await expect(
        writer.commit(alice, { ...commitOf("k1", "tx-1", 5), entries: [] }),
      ).rejects.toThrow(code("unbalancedEntries"));
    });

    it("correction reverses and replaces atomically, keeping the original", async () => {
      const original = commitOf("k1", "tx-1", 500_000);
      await writer.commit(alice, original);
      const correction = correctionOf("c1", "tx-1", 300_000);
      const result = await writer.commitCorrection(alice, correction);
      expect(result).toEqual({ status: "committed", transactionId: correction.reversal.id });

      const stored = await reader.getTransaction(alice, original.transaction.id);
      expect(stored?.state).toBe("reversed");
      expect(stored?.reversedBy).toBe(correction.reversal.id);
      expect(await reader.getEntries(alice, original.transaction.id)).toHaveLength(2);
      const reversal = await reader.getTransaction(alice, correction.reversal.id);
      expect(reversal).toMatchObject({ state: "posted", correctionOf: "tx-1", rationale: "typo" });
      const replacementId = correction.replacement?.transaction.id;
      if (replacementId === undefined) throw new Error("replacement expected");
      expect(await reader.getTransaction(alice, replacementId)).toMatchObject({
        state: "posted",
        correctionOf: "tx-1",
      });
      expect(await reader.getBalance(alice, cash.id)).toBe(300_000);
      expect(await reader.getBalance(alice, bank.id)).toBe(-300_000);
    });

    it("a pure reversal zeroes the balances", async () => {
      await writer.commit(alice, commitOf("k1", "tx-1", 500_000));
      await writer.commitCorrection(alice, correctionOf("c1", "tx-1", null));
      expect(await reader.getBalance(alice, cash.id)).toBe(0);
      expect(await reader.getBalance(alice, bank.id)).toBe(0);
    });

    it("returns duplicate for a replayed correction", async () => {
      await writer.commit(alice, commitOf("k1", "tx-1", 500_000));
      const correction = correctionOf("c1", "tx-1", 300_000);
      const first = await writer.commitCorrection(alice, correction);
      expect(await writer.commitCorrection(alice, correction)).toEqual({
        status: "duplicate",
        transactionId: committedId(first),
      });
      expect(await reader.getBalance(alice, cash.id)).toBe(300_000);
    });

    it("a rejected correction writes nothing", async () => {
      await writer.commit(alice, commitOf("k1", "tx-1", 500_000));
      const bad: CorrectionCommit = {
        ...correctionOf("c1", "tx-1", 300_000),
        replacement: {
          transaction: record("tx-1:repl:c1"),
          entries: [{ account: cash, side: "debit", amount: bdt(5) }],
        },
      };
      await expect(writer.commitCorrection(alice, bad)).rejects.toThrow(code("unbalancedEntries"));
      expect((await reader.getTransaction(alice, asTransactionId("tx-1")))?.state).toBe("posted");
      expect(await reader.getTransaction(alice, bad.reversal.id)).toBeNull();
      expect(await reader.getBalance(alice, cash.id)).toBe(500_000);
    });

    it("rejects reversing a transaction that is already reversed", async () => {
      await writer.commit(alice, commitOf("k1", "tx-1", 500_000));
      await writer.commitCorrection(alice, correctionOf("c1", "tx-1", 300_000));
      await expect(
        writer.commitCorrection(alice, correctionOf("c2", "tx-1", 100_000)),
      ).rejects.toThrow(code("invalidTransition"));
      expect(await reader.getBalance(alice, cash.id)).toBe(300_000);
    });

    it("lets exactly one of two concurrent corrections win", async () => {
      await writer.commit(alice, commitOf("k1", "tx-1", 500_000));
      const results = await Promise.allSettled([
        writer.commitCorrection(alice, correctionOf("c1", "tx-1", 300_000)),
        writer.commitCorrection(alice, correctionOf("c2", "tx-1", 100_000)),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      const balance = await reader.getBalance(alice, cash.id);
      expect([300_000, 100_000]).toContain(balance);
      expect(await reader.recomputeBalance(alice, cash.id)).toBe(balance);
    });

    it("rejects reversing a pending or unknown transaction", async () => {
      await writer.savePending(alice, record("tx-p", { state: "pending" }));
      await expect(
        writer.commitCorrection(alice, correctionOf("c1", "tx-p", null)),
      ).rejects.toThrow(code("invalidTransition"));
      await expect(
        writer.commitCorrection(alice, correctionOf("c2", "tx-missing", null)),
      ).rejects.toThrow(code("invalidTransition"));
      expect((await reader.getTransaction(alice, asTransactionId("tx-p")))?.state).toBe("pending");
    });

    it("writes a cutover marker with no entries", async () => {
      const marker = markerCommit("opening:cash-1", "cash-1", "hash-a");
      expect((await writer.commit(alice, marker)).status).toBe("committed");
      expect(await reader.getEntries(alice, marker.transaction.id)).toEqual([]);
    });

    it("a second opening marker for an account with a different payload conflicts", async () => {
      await writer.commit(alice, markerCommit("opening:cash-1", "cash-1", "hash-a"));
      expect(
        await writer.commit(alice, markerCommit("opening:cash-1", "cash-1", "hash-b")),
      ).toEqual({ status: "idempotencyConflict" });
      // Even under a different key, an account never gets a second marker.
      expect(await writer.commit(alice, markerCommit("opening:other", "cash-1", "hash-c"))).toEqual(
        { status: "idempotencyConflict" },
      );
      expect(
        await reader.getTransaction(alice, asTransactionId("marker-opening:other")),
      ).toBeNull();
      // Another account, and another owner, are independent.
      expect(
        (await writer.commit(alice, markerCommit("opening:bank-1", "bank-1", "hash-d"))).status,
      ).toBe("committed");
      expect(
        (await writer.commit(bob, markerCommit("opening:cash-1", "cash-1", "hash-a"))).status,
      ).toBe("committed");
    });

    it("balance projection equals a recompute from entries", async () => {
      await writer.commit(alice, commitOf("k1", "tx-1", 500_000));
      await writer.commit(alice, commitOf("k2", "tx-2", 120_000));
      await writer.commitCorrection(alice, correctionOf("c1", "tx-1", 300_000));
      await writer.commit(alice, commitOf("k3", "tx-3", 7));
      for (const id of [cash.id, bank.id]) {
        expect(await reader.getBalance(alice, id)).toBe(await reader.recomputeBalance(alice, id));
      }
      expect(await reader.getBalance(alice, cash.id)).toBe(420_007);
    });

    it("stores accounts per owner and omits unknown ids", async () => {
      const record1 = {
        id: asAccountId("acc-1"),
        kind: "bank" as const,
        name: "Main",
        currency: "BDT" as const,
        status: "active" as const,
        createdAtMs: 5,
      };
      await accounts.create(alice, record1);
      expect(await accounts.getMany(alice, [record1.id, asAccountId("nope")])).toEqual([record1]);
      expect(await accounts.getMany(bob, [record1.id])).toEqual([]);
    });
  });
}
