import { describeLedgerContract } from "@moneytrace/application/testing";
import { OWNER_COLLECTIONS, type OwnerCollectionName } from "@moneytrace/contracts";
import {
  LedgerDate,
  Money,
  asAccountId,
  asIdempotencyKey,
  asOwnerId,
  asTransactionId,
  type AccountRef,
  type EntryDraft,
} from "@moneytrace/domain";
import type { CorrectionCommit, LedgerCommit, TransactionRecord } from "@moneytrace/application";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { FirestoreAccountRepository } from "../src/firestore/firestore-account-repository";
import { FirestoreLedgerReader } from "../src/firestore/firestore-ledger-reader";
import { FirestoreLedgerWriter } from "../src/firestore/firestore-ledger-writer";
import { ownerPath } from "../src/firestore/paths";

const PROJECT_ID = "demo-moneytrace";
const host = process.env["FIRESTORE_EMULATOR_HOST"];
if (host === undefined) throw new Error("run through `firebase emulators:exec`");
const emulatorHost: string = host;

// Skip the GCE metadata probe: it only produces a timeout warning against the emulator.
process.env["METADATA_SERVER_DETECTION"] = "none";

const db: Firestore = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));
/** Contended Firestore transactions retry with a 1s-and-growing backoff, so they are slow by design. */
const CONTENTION_TIMEOUT_MS = 120_000;
const clock = { nowMs: () => 1_700_000_001_000 };

async function clearFirestore(): Promise<void> {
  const res = await fetch(
    `http://${emulatorHost}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`could not clear the emulator: ${String(res.status)}`);
}

async function makeFirestoreHarness() {
  await clearFirestore();
  const ledgerWriter = new FirestoreLedgerWriter(db, clock);
  return {
    writer: ledgerWriter,
    reader: new FirestoreLedgerReader(db, clock),
    accounts: new FirestoreAccountRepository(db, clock),
  };
}

describeLedgerContract("firestore", makeFirestoreHarness);

const owner = asOwnerId("alice");
const bank: AccountRef = { id: asAccountId("bank-1"), kind: "bank", currency: "BDT" };
const cash: AccountRef = { id: asAccountId("cash-1"), kind: "cash", currency: "BDT" };
const card: AccountRef = { id: asAccountId("card-1"), kind: "creditLiability", currency: "BDT" };
const food: AccountRef = {
  id: asAccountId("nominal:expense:food:BDT"),
  kind: "expense",
  currency: "BDT",
};
const bdt = (n: number): Money => Money.ofMinor(n, "BDT");

const tx = (id: string, extra: Partial<TransactionRecord> = {}): TransactionRecord => ({
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

const withdrawal = (n: number): EntryDraft[] => [
  { account: cash, side: "debit", amount: bdt(n) },
  { account: bank, side: "credit", amount: bdt(n) },
];

const commitOf = (key: string, id: string, n: number): LedgerCommit => ({
  idempotencyKey: asIdempotencyKey(key),
  payloadHash: `hash-${key}`,
  transaction: tx(id),
  entries: withdrawal(n),
});

const correction = (key: string, original: string, replacement: number): CorrectionCommit => ({
  idempotencyKey: asIdempotencyKey(key),
  payloadHash: `hash-${key}`,
  originalTransactionId: asTransactionId(original),
  reversal: tx(`rev-${key}`, { correctionOf: asTransactionId(original) }),
  reversalEntries: withdrawal(500_000).map((e) => ({
    ...e,
    side: e.side === "debit" ? "credit" : "debit",
  })),
  replacement: {
    transaction: tx(`rep-${key}`, { correctionOf: asTransactionId(original) }),
    entries: withdrawal(replacement),
  },
});

describe("firestore ledger adapters", () => {
  let writer: FirestoreLedgerWriter;
  let reader: FirestoreLedgerReader;

  beforeEach(async () => {
    ({ writer, reader } = await makeFirestoreHarness());
  });

  it("gate 26: card purchase and partial repayment commit atomically", async () => {
    await writer.commit(owner, {
      idempotencyKey: asIdempotencyKey("purchase"),
      payloadHash: "h1",
      transaction: tx("tx-buy", { intentType: "cardPurchase" }),
      entries: [
        { account: food, side: "debit", amount: bdt(1_000) },
        { account: card, side: "credit", amount: bdt(1_000) },
      ],
    });
    await writer.commit(owner, {
      idempotencyKey: asIdempotencyKey("repay"),
      payloadHash: "h2",
      transaction: tx("tx-repay", { intentType: "cardRepayment" }),
      entries: [
        { account: card, side: "debit", amount: bdt(400) },
        { account: bank, side: "credit", amount: bdt(400) },
      ],
    });
    expect(await reader.getBalance(owner, food.id)).toBe(1_000);
    expect(await reader.getBalance(owner, card.id)).toBe(-600);
    expect(await reader.getBalance(owner, bank.id)).toBe(-400);
    expect(await reader.recomputeBalance(owner, card.id)).toBe(-600);
  });

  it("ten parallel commits with one key produce one transaction", async () => {
    const commit = commitOf("k1", "tx-1", 500_000);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => writer.commit(owner, commit)),
    );
    expect(results.filter((r) => r.status === "committed")).toHaveLength(1);
    expect(results.filter((r) => r.status === "duplicate")).toHaveLength(9);
    expect(await reader.getBalance(owner, cash.id)).toBe(500_000);
    expect(await reader.getEntries(owner, commit.transaction.id)).toHaveLength(2);
  });

  it("two parallel corrections of one transaction: exactly one wins", async () => {
    await writer.commit(owner, commitOf("k1", "tx-1", 500_000));
    const results = await Promise.allSettled([
      writer.commitCorrection(owner, correction("a", "tx-1", 300_000)),
      writer.commitCorrection(owner, correction("b", "tx-1", 100_000)),
    ]);
    const won = results.filter((r) => r.status === "fulfilled" && r.value.status === "committed");
    expect(won).toHaveLength(1);
    const lost = results.filter((r) => r.status === "rejected");
    expect(lost).toHaveLength(1);
    expect(lost[0]).toMatchObject({ reason: { code: "invalidTransition" } });
    const balance = await reader.getBalance(owner, cash.id);
    expect([300_000, 100_000]).toContain(balance);
    expect(await reader.recomputeBalance(owner, cash.id)).toBe(balance);
  });

  it("a failure during commit leaves no partial writes", async () => {
    await writer.commit(owner, commitOf("k1", "tx-1", 100));
    const doomed = commitOf("k2", "tx-1", 999);
    await expect(writer.commit(owner, doomed)).rejects.toMatchObject({
      code: "invalidTransition",
    });
    expect(await reader.getEntries(owner, doomed.transaction.id)).toHaveLength(2);
    expect(await reader.getBalance(owner, cash.id)).toBe(100);
    const record = await db.doc(ownerPath(owner, "idempotencyRecords", "ledger:k2")).get();
    expect(record.exists).toBe(false);
  });

  it("a failure at commit time leaves no partial writes", async () => {
    // The second entry already exists, so `create` fails only when the transaction commits,
    // after the transaction, the first entry, both balances and the record have been staged.
    await db.doc(ownerPath(owner, "ledgerEntries", "tx-x:2")).set({ planted: true });
    const doomed = commitOf("kx", "tx-x", 100);
    await expect(writer.commit(owner, doomed)).rejects.toThrow();
    const absent = async (collection: OwnerCollectionName, id: string): Promise<boolean> =>
      !(await db.doc(ownerPath(owner, collection, id)).get()).exists;
    expect(await absent("transactions", "tx-x")).toBe(true);
    expect(await absent("ledgerEntries", "tx-x:1")).toBe(true);
    expect(await absent("idempotencyRecords", "ledger:kx")).toBe(true);
    expect(await absent("balances", cash.id)).toBe(true);
    expect(await absent("balances", bank.id)).toBe(true);
  });

  it(
    "parallel commits with distinct keys on one balance lose no update",
    async () => {
      const n = 10;
      const results = await Promise.all(
        Array.from({ length: n }, (_, i) =>
          writer.commit(owner, commitOf(`d${String(i)}`, `tx-d${String(i)}`, 1_000)),
        ),
      );
      expect(results.every((r) => r.status === "committed")).toBe(true);
      expect(await reader.getBalance(owner, cash.id)).toBe(n * 1_000);
      expect(await reader.getBalance(owner, bank.id)).toBe(-n * 1_000);
      expect(await reader.recomputeBalance(owner, cash.id)).toBe(n * 1_000);
      const snap = await db.doc(ownerPath(owner, "balances", cash.id)).get();
      expect(snap.get("version")).toBe(n);
    },
    CONTENTION_TIMEOUT_MS,
  );

  it(
    "an opening racing a posting on the same account never lets both succeed",
    async () => {
      for (let i = 0; i < 12; i += 1) {
        const raced: AccountRef = {
          id: asAccountId(`race-${String(i)}`),
          kind: "cash",
          currency: "BDT",
        };
        const at = 1_700_000_000_000;
        const posting: LedgerCommit = {
          idempotencyKey: asIdempotencyKey(`race-post-${String(i)}`),
          payloadHash: "p",
          transaction: tx(`race-tx-${String(i)}`, { occurredAtMs: at }),
          entries: [
            { account: raced, side: "debit", amount: bdt(100) },
            { account: bank, side: "credit", amount: bdt(100) },
          ],
        };
        const opening: LedgerCommit = {
          idempotencyKey: asIdempotencyKey(`race-open-${String(i)}`),
          payloadHash: "o",
          transaction: tx(`race-open-tx-${String(i)}`, {
            intentType: "openingBalance",
            occurredAtMs: at,
          }),
          entries: [],
          cutoverMarker: { accountId: raced.id, effectiveAt: LedgerDate.fromEpochMs(at) },
        };
        const [p, o] = await Promise.allSettled([
          writer.commit(owner, posting),
          writer.commit(owner, opening),
        ]);
        const posted = p.status === "fulfilled";
        const opened = o.status === "fulfilled";
        expect(posted !== opened, `round ${String(i)}`).toBe(true);
        const markers = await reader.getCutoverMarkers(owner, [raced.id]);
        expect(markers).toHaveLength(opened ? 1 : 0);
        expect(await reader.getBalance(owner, raced.id)).toBe(posted ? 100 : 0);
      }
    },
    CONTENTION_TIMEOUT_MS,
  );

  it("every stored document validates against its contract schema", async () => {
    await writer.commit(owner, commitOf("k1", "tx-1", 500_000));
    await writer.commitCorrection(owner, correction("c1", "tx-1", 300_000));
    await writer.savePending(owner, tx("tx-p", { state: "pending" }));
    await writer.commit(owner, {
      idempotencyKey: asIdempotencyKey("opening"),
      payloadHash: "ho",
      transaction: tx("tx-open", { intentType: "openingBalance", occurredAtMs: 1_600_000_000_000 }),
      entries: [],
      cutoverMarker: {
        accountId: asAccountId("bank-9"),
        effectiveAt: LedgerDate.fromEpochMs(1_600_000_000_000),
      },
    });
    const names: OwnerCollectionName[] = [
      "transactions",
      "ledgerEntries",
      "balances",
      "idempotencyRecords",
      "cutoverMarkers",
    ];
    for (const name of names) {
      const snap = await db.collection(ownerPath(owner, name)).get();
      expect(snap.size, name).toBeGreaterThan(0);
      for (const d of snap.docs) {
        expect(() => OWNER_COLLECTIONS[name].parse(d.data()), `${name}/${d.id}`).not.toThrow();
      }
    }
  });
});
