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

const EFFECTIVE = 1_699_000_000_000;
const equity: AccountRef = {
  id: asAccountId("nominal:equity:opening:BDT"),
  kind: "equity",
  currency: "BDT",
};

const markerCommit = (
  key: string,
  accountId: string,
  hash: string,
  effectiveMs = EFFECTIVE,
): LedgerCommit => ({
  idempotencyKey: asIdempotencyKey(key),
  payloadHash: hash,
  transaction: record(`marker-${key}`, { intentType: "openingBalance", occurredAtMs: effectiveMs }),
  entries: [],
  cutoverMarker: {
    accountId: asAccountId(accountId),
    effectiveAt: LedgerDate.fromEpochMs(effectiveMs),
  },
});

/** An opening on the cash account: cash debit, opening equity credit. */
const openingCommit = (amount: number): LedgerCommit => ({
  ...markerCommit("opening:cash-1", "cash-1", `hash-open-${String(amount)}`),
  transaction: record("opening-cash-1", { intentType: "openingBalance", occurredAtMs: EFFECTIVE }),
  entries: [
    { account: cash, side: "debit", amount: bdt(amount) },
    { account: equity, side: "credit", amount: bdt(amount) },
  ],
});

const openingCorrection = (
  key: string,
  original: string,
  originalAmount: number,
  replacementAmount: number,
  effectiveMs: number,
): CorrectionCommit => ({
  idempotencyKey: asIdempotencyKey(key),
  payloadHash: `hash-${key}`,
  originalTransactionId: asTransactionId(original),
  reversal: record(`${original}:rev`, {
    intentType: "openingBalance",
    occurredAtMs: EFFECTIVE,
    correctionOf: asTransactionId(original),
  }),
  reversalEntries:
    originalAmount === 0
      ? []
      : [
          { account: cash, side: "credit", amount: bdt(originalAmount) },
          { account: equity, side: "debit", amount: bdt(originalAmount) },
        ],
  replacement: {
    transaction: record(`${original}:repl`, {
      intentType: "openingBalance",
      occurredAtMs: effectiveMs,
      correctionOf: asTransactionId(original),
    }),
    entries:
      replacementAmount === 0
        ? []
        : [
            { account: cash, side: "debit", amount: bdt(replacementAmount) },
            { account: equity, side: "credit", amount: bdt(replacementAmount) },
          ],
  },
  cutoverMarker: { accountId: cash.id, effectiveAt: LedgerDate.fromEpochMs(effectiveMs) },
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
          transaction: record("tx-1:repl:c1", { correctionOf: asTransactionId("tx-1") }),
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

    it("stores the marker's effective date and returns it per owner and account", async () => {
      await writer.commit(alice, markerCommit("opening:cash-1", "cash-1", "hash-a"));
      const markers = await reader.getCutoverMarkers(alice, [cash.id, bank.id]);
      expect(markers.map((m) => [m.accountId, m.effectiveAt.epochMs])).toEqual([
        ["cash-1", EFFECTIVE],
      ]);
      expect(await reader.getCutoverMarkers(bob, [cash.id])).toEqual([]);
    });

    it("rejects a marker whose date differs from the transaction's occurredAtMs", async () => {
      const bad = markerCommit("opening:cash-1", "cash-1", "hash-a");
      await expect(
        writer.commit(alice, {
          ...bad,
          transaction: record("marker-x", { occurredAtMs: EFFECTIVE + 1 }),
        }),
      ).rejects.toThrow(code("invalidIntent"));
      expect(await reader.getCutoverMarkers(alice, [cash.id])).toEqual([]);
    });

    it("an opening correction replaces the marker atomically with the replacement", async () => {
      await writer.commit(alice, openingCommit(100_000));
      const result = await writer.commitCorrection(
        alice,
        openingCorrection("fix1", "opening-cash-1", 100_000, 120_000, EFFECTIVE + 1000),
      );
      expect(result.status).toBe("committed");
      const markers = await reader.getCutoverMarkers(alice, [cash.id]);
      expect(markers.map((m) => m.effectiveAt.epochMs)).toEqual([EFFECTIVE + 1000]);
      expect(await reader.getBalance(alice, cash.id)).toBe(120_000);
      expect((await reader.getTransaction(alice, asTransactionId("opening-cash-1")))?.state).toBe(
        "reversed",
      );
    });

    it("a zero opening corrects with an empty reversal, and a zero replacement keeps a marker", async () => {
      await writer.commit(alice, markerCommit("opening:cash-1", "cash-1", "hash-a"));
      const original = asTransactionId("marker-opening:cash-1");
      const toZero = openingCorrection("fix1", "marker-opening:cash-1", 0, 0, EFFECTIVE + 5);
      expect((await writer.commitCorrection(alice, toZero)).status).toBe("committed");
      expect((await reader.getTransaction(alice, original))?.state).toBe("reversed");
      expect(
        await reader.getEntries(alice, toZero.replacement?.transaction.id ?? original),
      ).toEqual([]);
      const markers = await reader.getCutoverMarkers(alice, [cash.id]);
      expect(markers.map((m) => m.effectiveAt.epochMs)).toEqual([EFFECTIVE + 5]);
    });

    it("an opening correction needs a marker and a replacement, and only openings carry one", async () => {
      await writer.commit(alice, openingCommit(100_000));
      const good = openingCorrection("fix1", "opening-cash-1", 100_000, 120_000, EFFECTIVE + 1000);
      const noMarker: CorrectionCommit = { ...good };
      delete noMarker.cutoverMarker;
      const noReplacement: CorrectionCommit = { ...good };
      delete noReplacement.replacement;
      await expect(writer.commitCorrection(alice, noMarker)).rejects.toThrow(code("invalidIntent"));
      await expect(writer.commitCorrection(alice, noReplacement)).rejects.toThrow(
        code("invalidIntent"),
      );
      expect((await reader.getTransaction(alice, asTransactionId("opening-cash-1")))?.state).toBe(
        "posted",
      );
      expect(await reader.getBalance(alice, cash.id)).toBe(100_000);

      await writer.commit(alice, commitOf("k1", "tx-1", 500_000));
      await expect(
        writer.commitCorrection(alice, {
          ...correctionOf("c1", "tx-1", 300_000),
          cutoverMarker: good.cutoverMarker as NonNullable<typeof good.cutoverMarker>,
        }),
      ).rejects.toThrow(code("invalidIntent"));
      expect((await reader.getTransaction(alice, asTransactionId("tx-1")))?.state).toBe("posted");
    });

    it("rejects reversal entries that do not mirror the stored entries", async () => {
      await writer.commit(alice, commitOf("k1", "tx-1", 500_000));
      const base = correctionOf("c1", "tx-1", null);
      const wrongAmount: CorrectionCommit = {
        ...base,
        reversalEntries: [
          { account: cash, side: "credit", amount: bdt(1) },
          { account: bank, side: "debit", amount: bdt(1) },
        ],
      };
      const sameSide: CorrectionCommit = { ...base, reversalEntries: withdrawal(500_000) };
      const wrongAccount: CorrectionCommit = {
        ...base,
        reversalEntries: [
          { account: equity, side: "credit", amount: bdt(500_000) },
          { account: bank, side: "debit", amount: bdt(500_000) },
        ],
      };
      for (const bad of [wrongAmount, sameSide, wrongAccount]) {
        await expect(writer.commitCorrection(alice, bad)).rejects.toThrow(code("invalidIntent"));
      }
      expect((await reader.getTransaction(alice, asTransactionId("tx-1")))?.state).toBe("posted");
      expect(await reader.getBalance(alice, cash.id)).toBe(500_000);
    });

    it("rejects a reversal not linked to the original, or not posted", async () => {
      await writer.commit(alice, commitOf("k1", "tx-1", 500_000));
      const base = correctionOf("c1", "tx-1", null);
      const unlinked = { ...base, reversal: record("rev-x") };
      const pendingReversal = {
        ...base,
        reversal: { ...base.reversal, state: "pending" as const },
      };
      await expect(writer.commitCorrection(alice, unlinked)).rejects.toThrow(code("invalidIntent"));
      await expect(writer.commitCorrection(alice, pendingReversal)).rejects.toThrow(
        code("invalidIntent"),
      );
      expect(await reader.getBalance(alice, cash.id)).toBe(500_000);
    });

    it("rejects reversing a transaction that is itself a reversal", async () => {
      await writer.commit(alice, commitOf("k1", "tx-1", 500_000));
      const first = correctionOf("c1", "tx-1", null);
      await writer.commitCorrection(alice, first);
      const undo: CorrectionCommit = {
        idempotencyKey: asIdempotencyKey("c2"),
        payloadHash: "hash-c2",
        originalTransactionId: first.reversal.id,
        reversal: record("undo", { correctionOf: first.reversal.id }),
        reversalEntries: withdrawal(500_000),
      };
      await expect(writer.commitCorrection(alice, undo)).rejects.toThrow(code("invalidTransition"));
      expect(await reader.getBalance(alice, cash.id)).toBe(0);
    });

    it("returns idempotencyConflict for a correction key reused with another payload", async () => {
      await writer.commit(alice, commitOf("k1", "tx-1", 500_000));
      await writer.commit(alice, commitOf("k2", "tx-2", 500_000));
      await writer.commitCorrection(alice, correctionOf("c1", "tx-1", 300_000));
      const other = {
        ...correctionOf("c9", "tx-2", 100_000),
        idempotencyKey: asIdempotencyKey("c1"),
      };
      expect(await writer.commitCorrection(alice, other)).toEqual({
        status: "idempotencyConflict",
      });
      expect((await reader.getTransaction(alice, asTransactionId("tx-2")))?.state).toBe("posted");
      expect(await reader.getBalance(alice, cash.id)).toBe(800_000);
    });

    it("refuses a first marker dated at or after existing activity, and writes nothing", async () => {
      await writer.commit(alice, commitOf("k1", "tx-1", 500_000));
      const activity = 1_700_000_000_000;
      for (const ms of [activity, activity + 1]) {
        await expect(
          writer.commit(alice, markerCommit("opening:cash-1", "cash-1", "hash-a", ms)),
        ).rejects.toThrow(code("cutoverHasActivity"));
      }
      expect(await reader.getCutoverMarkers(alice, [cash.id])).toEqual([]);
      expect(
        await reader.getTransaction(alice, asTransactionId("marker-opening:cash-1")),
      ).toBeNull();
      // Before the activity, and on an account without activity, it is fine.
      expect(
        (
          await writer.commit(
            alice,
            markerCommit("opening:cash-1", "cash-1", "hash-a", activity - 1),
          )
        ).status,
      ).toBe("committed");
      // Another owner's activity does not matter.
      expect(
        (await writer.commit(bob, markerCommit("opening:cash-1", "cash-1", "hash-a", activity + 5)))
          .status,
      ).toBe("committed");
    });

    it("a replayed opening stays a duplicate", async () => {
      const marker = markerCommit("opening:cash-1", "cash-1", "hash-a");
      const first = await writer.commit(alice, marker);
      expect(await writer.commit(alice, marker)).toEqual({
        status: "duplicate",
        transactionId: committedId(first),
      });
    });

    it("an opening-balance commit must carry a marker", async () => {
      const bad: Partial<LedgerCommit> = { ...openingCommit(100) };
      delete bad.cutoverMarker;
      await expect(writer.commit(alice, bad as LedgerCommit)).rejects.toThrow(
        code("invalidIntent"),
      );
      expect(await reader.getTransaction(alice, asTransactionId("opening-cash-1"))).toBeNull();
      expect(await reader.getBalance(alice, cash.id)).toBe(0);
    });

    it("a replayed correction stays a duplicate after its opening marker moved", async () => {
      await writer.commit(alice, openingCommit(100_000));
      const fix = openingCorrection("fix1", "opening-cash-1", 100_000, 110_000, EFFECTIVE + 1000);
      const first = await writer.commitCorrection(alice, fix);
      expect(await writer.commitCorrection(alice, fix)).toEqual({
        status: "duplicate",
        transactionId: committedId(first),
      });
      expect(await reader.getBalance(alice, cash.id)).toBe(110_000);
    });

    it("refuses any new entries on an account at or before its stored marker", async () => {
      await writer.commit(alice, markerCommit("opening:cash-1", "cash-1", "hash-a"));
      const at = (n: number, ms: number): LedgerCommit => {
        const c = commitOf(`k${String(n)}`, `tx-${String(n)}`, 100);
        return { ...c, transaction: record(`tx-${String(n)}`, { occurredAtMs: ms }) };
      };
      await expect(writer.commit(alice, at(1, EFFECTIVE))).rejects.toThrow(code("beforeCutover"));
      await expect(writer.commit(alice, at(2, EFFECTIVE - 1))).rejects.toThrow(
        code("beforeCutover"),
      );
      expect(await reader.getTransaction(alice, asTransactionId("tx-1"))).toBeNull();
      expect(await reader.getBalance(alice, cash.id)).toBe(0);
      expect((await writer.commit(alice, at(3, EFFECTIVE + 1))).status).toBe("committed");
      // Another owner's marker does not apply.
      expect((await writer.commit(bob, at(1, EFFECTIVE - 1))).status).toBe("committed");
    });

    it("requires a stored marker for every real account when asked", async () => {
      const strict = { ...commitOf("k1", "tx-1", 100), requireCutoverMarker: true };
      await expect(writer.commit(alice, strict)).rejects.toThrow(code("beforeCutover"));
      await writer.commit(alice, markerCommit("opening:cash-1", "cash-1", "hash-a"));
      await expect(writer.commit(alice, strict)).rejects.toThrow(code("beforeCutover"));
      await writer.commit(alice, markerCommit("opening:bank-1", "bank-1", "hash-b"));
      expect((await writer.commit(alice, strict)).status).toBe("committed");
    });

    it("a correction replacement must respect the stored marker", async () => {
      await writer.commit(alice, markerCommit("opening:cash-1", "cash-1", "hash-a"));
      await writer.commit(alice, commitOf("k1", "tx-1", 500_000));
      const base = correctionOf("c1", "tx-1", 300_000);
      const replacement = base.replacement;
      if (replacement === undefined) throw new Error("replacement expected");
      const early: CorrectionCommit = {
        ...base,
        replacement: {
          ...replacement,
          transaction: { ...replacement.transaction, occurredAtMs: EFFECTIVE },
        },
      };
      await expect(writer.commitCorrection(alice, early)).rejects.toThrow(code("beforeCutover"));
      expect((await reader.getTransaction(alice, asTransactionId("tx-1")))?.state).toBe("posted");
      expect(await reader.getBalance(alice, cash.id)).toBe(500_000);
      expect((await writer.commitCorrection(alice, base)).status).toBe("committed");
    });

    it("a correction replacement can require a marker, and writes nothing without one", async () => {
      await writer.commit(alice, commitOf("k1", "tx-1", 500_000));
      const base = correctionOf("c1", "tx-1", 300_000);
      const replacement = base.replacement;
      if (replacement === undefined) throw new Error("replacement expected");
      const strict: CorrectionCommit = {
        ...base,
        replacement: { ...replacement, requireCutoverMarker: true },
      };
      await expect(writer.commitCorrection(alice, strict)).rejects.toThrow(code("beforeCutover"));
      expect((await reader.getTransaction(alice, asTransactionId("tx-1")))?.state).toBe("posted");
      expect(await reader.getTransaction(alice, strict.reversal.id)).toBeNull();
      expect(await reader.getBalance(alice, cash.id)).toBe(500_000);
      // With markers on both accounts the same correction goes through.
      await writer.commit(
        alice,
        markerCommit("opening:cash-1", "cash-1", "hash-a", 1_699_000_000_000),
      );
      await writer.commit(
        alice,
        markerCommit("opening:bank-1", "bank-1", "hash-b", 1_699_000_000_000),
      );
      expect((await writer.commitCorrection(alice, strict)).status).toBe("committed");
    });

    it("other accounts' and other owners' activity does not block a forward marker move", async () => {
      await writer.commit(alice, openingCommit(100_000));
      const bank2: AccountRef = { id: asAccountId("bank-2"), kind: "bank", currency: "BDT" };
      const elsewhere: LedgerCommit = {
        ...commitOf("k1", "tx-1", 500),
        transaction: record("tx-1", { occurredAtMs: EFFECTIVE + 10 }),
        entries: [
          { account: bank, side: "debit", amount: bdt(500) },
          { account: bank2, side: "credit", amount: bdt(500) },
        ],
      };
      await writer.commit(alice, elsewhere);
      await writer.commit(bob, {
        ...commitOf("k2", "tx-2", 500),
        transaction: record("tx-2", { occurredAtMs: EFFECTIVE + 10 }),
      });
      const moved = await writer.commitCorrection(
        alice,
        openingCorrection("fix1", "opening-cash-1", 100_000, 120_000, EFFECTIVE + 20),
      );
      expect(moved.status).toBe("committed");
      const markers = await reader.getCutoverMarkers(alice, [cash.id]);
      expect(markers.map((m) => m.effectiveAt.epochMs)).toEqual([EFFECTIVE + 20]);
    });

    it("moving a marker earlier is allowed; the replacement opening is exempt from the old marker", async () => {
      await writer.commit(alice, openingCommit(100_000));
      const result = await writer.commitCorrection(
        alice,
        openingCorrection("fix1", "opening-cash-1", 100_000, 110_000, EFFECTIVE - 1000),
      );
      expect(result.status).toBe("committed");
      const markers = await reader.getCutoverMarkers(alice, [cash.id]);
      expect(markers.map((m) => m.effectiveAt.epochMs)).toEqual([EFFECTIVE - 1000]);
    });

    it("refuses to move a marker forward over recorded activity, reversed or not", async () => {
      await writer.commit(alice, openingCommit(100_000));
      await writer.commit(alice, {
        ...commitOf("k1", "tx-1", 500_000),
        transaction: record("tx-1", { occurredAtMs: EFFECTIVE + 10 }),
      });
      const forward = (key: string, original: string, from: number, to: number, ms: number) =>
        writer.commitCorrection(alice, openingCorrection(key, original, from, to, ms));
      await expect(
        forward("f1", "opening-cash-1", 100_000, 120_000, EFFECTIVE + 20),
      ).rejects.toThrow(code("cutoverHasActivity"));
      // Equal to the activity's date also counts.
      await expect(
        forward("f2", "opening-cash-1", 100_000, 120_000, EFFECTIVE + 10),
      ).rejects.toThrow(code("cutoverHasActivity"));
      expect(await reader.getBalance(alice, cash.id)).toBe(600_000);
      expect((await reader.getTransaction(alice, asTransactionId("opening-cash-1")))?.state).toBe(
        "posted",
      );

      // Reversing the activity does not free the boundary: its entries still count.
      const reverseActivity = correctionOf("c1", "tx-1", null);
      await writer.commitCorrection(alice, reverseActivity);
      await expect(
        forward("f3", "opening-cash-1", 100_000, 120_000, EFFECTIVE + 20),
      ).rejects.toThrow(code("cutoverHasActivity"));
      // Before the activity it is fine.
      expect((await forward("f4", "opening-cash-1", 100_000, 120_000, EFFECTIVE + 5)).status).toBe(
        "committed",
      );
    });

    it("moving a marker forward over only the opening's own transactions is allowed", async () => {
      await writer.commit(alice, openingCommit(100_000));
      await writer.commitCorrection(
        alice,
        openingCorrection("f1", "opening-cash-1", 100_000, 110_000, EFFECTIVE + 1000),
      );
      const second = await writer.commitCorrection(
        alice,
        openingCorrection("f2", "opening-cash-1:repl", 110_000, 120_000, EFFECTIVE + 2000),
      );
      expect(second.status).toBe("committed");
      expect(await reader.getBalance(alice, cash.id)).toBe(120_000);
    });

    it("tracks which transaction owns each marker, and moves ownership with a correction", async () => {
      await writer.commit(alice, openingCommit(100_000));
      const owner = async () =>
        (await reader.getCutoverMarkers(alice, [cash.id])).map((m) => m.transactionId);
      expect(await owner()).toEqual(["opening-cash-1"]);
      await writer.commitCorrection(
        alice,
        openingCorrection("f1", "opening-cash-1", 100_000, 110_000, EFFECTIVE + 1000),
      );
      expect(await owner()).toEqual(["opening-cash-1:repl"]);
    });

    it("rejects an opening correction whose marker belongs to another transaction", async () => {
      await writer.commit(alice, openingCommit(100_000));
      await writer.commit(alice, markerCommit("opening:bank-1", "bank-1", "hash-b"));
      const wrong: CorrectionCommit = {
        ...openingCorrection("f1", "opening-cash-1", 100_000, 110_000, EFFECTIVE + 1000),
        cutoverMarker: {
          accountId: bank.id,
          effectiveAt: LedgerDate.fromEpochMs(EFFECTIVE + 1000),
        },
      };
      await expect(writer.commitCorrection(alice, wrong)).rejects.toThrow(code("invalidIntent"));
      expect((await reader.getTransaction(alice, asTransactionId("opening-cash-1")))?.state).toBe(
        "posted",
      );
      const markers = await reader.getCutoverMarkers(alice, [bank.id, cash.id]);
      expect(markers.map((m) => m.effectiveAt.epochMs).sort()).toEqual([EFFECTIVE, EFFECTIVE]);
    });

    it("rejects a replacement that does not link back to the original", async () => {
      await writer.commit(alice, commitOf("k1", "tx-1", 500_000));
      const base = correctionOf("c1", "tx-1", 300_000);
      const replacement = base.replacement;
      if (replacement === undefined) throw new Error("replacement expected");
      const bad: CorrectionCommit = {
        ...base,
        replacement: { ...replacement, transaction: record("tx-1:repl:c1") },
      };
      await expect(writer.commitCorrection(alice, bad)).rejects.toThrow(code("invalidIntent"));
      expect(await reader.getBalance(alice, cash.id)).toBe(500_000);
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
