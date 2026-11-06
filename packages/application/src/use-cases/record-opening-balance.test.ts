import { beforeEach, describe, expect, it } from "vitest";
import {
  LedgerDate,
  Money,
  asAccountId,
  asIdempotencyKey,
  asOwnerId,
  asSourceEventId,
  asTransactionId,
  nominal,
  type AccountRef,
} from "@moneytrace/domain";
import { createWorld } from "../testing/world";
import { PostTransaction } from "./post-transaction";
import { RecordOpeningBalance } from "./record-opening-balance";
import { ReverseAndReplace } from "./reverse-and-replace";

const alice = asOwnerId("alice");
const bdt = (n: number): Money => Money.ofMinor(n, "BDT");
const code = (c: string): Error => expect.objectContaining({ code: c }) as Error;
const bankId = asAccountId("bank-1");
const bank: AccountRef = { id: bankId, kind: "bank", currency: "BDT" };
const cash: AccountRef = { id: asAccountId("cash-1"), kind: "cash", currency: "BDT" };
const DAY = 86_400_000;
const effective = 1_700_000_000_000;

let w: ReturnType<typeof createWorld>;
let opening: RecordOpeningBalance;

const record = (amount: number, effectiveAtMs = effective) =>
  opening.execute({
    ownerId: alice,
    accountId: bankId,
    amount: bdt(amount),
    effectiveAtMs,
    actor: "user",
  });

beforeEach(async () => {
  w = createWorld();
  opening = new RecordOpeningBalance({
    writer: w.ledger,
    accounts: w.accounts,
    hasher: w.hasher,
    clock: w.clock,
  });
  for (const a of [bank, cash]) {
    await w.accounts.create(alice, {
      id: a.id,
      kind: a.kind as "bank",
      name: a.id,
      currency: "BDT",
      status: "active",
      createdAtMs: 1,
    });
  }
});

describe("RecordOpeningBalance", () => {
  it("posts against opening equity under the specified key and transaction id", async () => {
    expect(await record(100_000)).toEqual({ status: "committed", transactionId: "opening-bank-1" });
    expect(await w.ledger.getBalance(alice, bankId)).toBe(100_000);
    expect(await w.ledger.getBalance(alice, nominal.openingEquity("BDT").id)).toBe(-100_000);
    expect(await w.ledger.getTransaction(alice, asTransactionId("opening-bank-1"))).toMatchObject({
      state: "posted",
      intentType: "openingBalance",
      occurredAtMs: effective,
    });
  });

  it("returns duplicate for the same values", async () => {
    await record(100_000);
    expect(await record(100_000)).toEqual({ status: "duplicate", transactionId: "opening-bank-1" });
    expect(await w.ledger.getBalance(alice, bankId)).toBe(100_000);
  });

  it("returns idempotencyConflict for a different amount or date, and the first stands", async () => {
    await record(100_000);
    expect(await record(120_000)).toEqual({ status: "idempotencyConflict" });
    expect(await record(100_000, effective + DAY)).toEqual({ status: "idempotencyConflict" });
    expect(await w.ledger.getBalance(alice, bankId)).toBe(100_000);
  });

  it("writes only the marker for a zero amount, and still conflicts on a changed date", async () => {
    expect(await record(0)).toEqual({ status: "committed", transactionId: "opening-bank-1" });
    expect(await w.ledger.getEntries(alice, asTransactionId("opening-bank-1"))).toEqual([]);
    expect(await w.ledger.getBalance(alice, bankId)).toBe(0);
    expect(await record(0)).toEqual({ status: "duplicate", transactionId: "opening-bank-1" });
    expect(await record(0, effective + DAY)).toEqual({ status: "idempotencyConflict" });
  });

  it("records a negative balance as an overdraft", async () => {
    await record(-2_500);
    expect(await w.ledger.getBalance(alice, bankId)).toBe(-2_500);
  });

  it("rejects an unknown account", async () => {
    await expect(
      opening.execute({
        ownerId: alice,
        accountId: asAccountId("ghost"),
        amount: bdt(5),
        effectiveAtMs: effective,
        actor: "user",
      }),
    ).rejects.toThrow(code("accountInvalid"));
  });

  it("gate 33: history at or before the cutover is refused, and correction goes through reversal", async () => {
    await record(100_000);
    const post = new PostTransaction({
      writer: w.ledger,
      accounts: w.accounts,
      hasher: w.hasher,
      clock: w.clock,
    });
    const cutovers = [{ accountId: bankId, effectiveAt: LedgerDate.fromEpochMs(effective) }];
    const historical = (occurredAtMs: number, key: string, txId: string) =>
      post.execute({
        ownerId: alice,
        idempotencyKey: asIdempotencyKey(key),
        transactionId: asTransactionId(txId),
        intent: {
          type: "historicalImport",
          inner: { type: "purchase", funding: bank, category: "food", amount: bdt(300) },
          occurredAt: LedgerDate.fromEpochMs(occurredAtMs),
          cutovers,
        },
        occurredAtMs,
        sourceEventIds: [asSourceEventId("csv-1")],
        actor: "import",
      });
    await expect(historical(effective, "h1", "tx-h1")).rejects.toThrow(code("beforeCutover"));
    await expect(historical(effective - DAY, "h2", "tx-h2")).rejects.toThrow(code("beforeCutover"));
    expect(await w.ledger.getBalance(alice, bankId)).toBe(100_000);
    expect((await historical(effective + DAY, "h3", "tx-h3")).status).toBe("committed");
    expect(await w.ledger.getBalance(alice, bankId)).toBe(99_700);

    const reverse = new ReverseAndReplace({
      writer: w.ledger,
      reader: w.ledger,
      accounts: w.accounts,
      hasher: w.hasher,
      clock: w.clock,
    });
    const corrected = await reverse.execute({
      ownerId: alice,
      idempotencyKey: asIdempotencyKey("fix-opening"),
      originalTransactionId: asTransactionId("opening-bank-1"),
      replacement: {
        type: "openingBalance",
        account: bank,
        amount: bdt(120_000),
        effectiveAt: LedgerDate.fromEpochMs(effective),
      },
      actor: "user",
      rationale: "statement showed 1200.00",
    });
    expect(corrected.status).toBe("committed");
    expect(await w.ledger.getBalance(alice, bankId)).toBe(119_700);
    expect(await w.ledger.getBalance(alice, nominal.openingEquity("BDT").id)).toBe(-120_000);
    // The original opening request still cannot be replayed with its old values as a new balance.
    expect(await record(100_000)).toEqual({ status: "duplicate", transactionId: "opening-bank-1" });
    expect(await w.ledger.getBalance(alice, bankId)).toBe(119_700);
  });
});
