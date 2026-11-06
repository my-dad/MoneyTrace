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
    reader: w.ledger,
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

  it("rejects a closed account", async () => {
    await w.accounts.create(alice, {
      id: asAccountId("old-1"),
      kind: "bank",
      name: "old",
      currency: "BDT",
      status: "closed",
      createdAtMs: 1,
    });
    await expect(
      opening.execute({
        ownerId: alice,
        accountId: asAccountId("old-1"),
        amount: bdt(5),
        effectiveAtMs: effective,
        actor: "user",
      }),
    ).rejects.toThrow(code("accountInvalid"));
    expect(await w.ledger.getBalance(alice, asAccountId("old-1"))).toBe(0);
  });

  it("rejects an amount in another currency than the account's", async () => {
    await expect(
      opening.execute({
        ownerId: alice,
        accountId: bankId,
        amount: Money.ofMinor(5, "USD" as unknown as "BDT"),
        effectiveAtMs: effective,
        actor: "user",
      }),
    ).rejects.toThrow(code("accountInvalid"));
    expect(await w.ledger.getTransaction(alice, asTransactionId("opening-bank-1"))).toBeNull();
  });

  it("rejects a blank actor", async () => {
    await expect(
      opening.execute({
        ownerId: alice,
        accountId: bankId,
        amount: bdt(5),
        effectiveAtMs: effective,
        actor: " ",
      }),
    ).rejects.toThrow(code("invalidIntent"));
  });

  const reverser = (): ReverseAndReplace =>
    new ReverseAndReplace({
      writer: w.ledger,
      reader: w.ledger,
      accounts: w.accounts,
      hasher: w.hasher,
      clock: w.clock,
    });
  const correctOpening = (amount: number, effectiveAtMs: number, key = "fix-opening") =>
    reverser().execute({
      ownerId: alice,
      idempotencyKey: asIdempotencyKey(key),
      originalTransactionId: asTransactionId("opening-bank-1"),
      replacement: {
        type: "openingBalance",
        account: bank,
        amount: bdt(amount),
        effectiveAt: LedgerDate.fromEpochMs(effectiveAtMs),
      },
      actor: "user",
      rationale: "statement showed a different figure",
    });

  it("gate 36: history at or before the cutover is refused using stored markers", async () => {
    await record(100_000);
    const post = new PostTransaction({
      writer: w.ledger,
      reader: w.ledger,
      accounts: w.accounts,
      hasher: w.hasher,
      clock: w.clock,
    });
    const historical = (occurredAtMs: number, key: string, txId: string) =>
      post.execute({
        ownerId: alice,
        idempotencyKey: asIdempotencyKey(key),
        transactionId: asTransactionId(txId),
        intent: {
          type: "historicalImport",
          inner: { type: "purchase", funding: bank, category: "food", amount: bdt(300) },
          occurredAt: LedgerDate.fromEpochMs(occurredAtMs),
          // A forged marker the caller supplies must be ignored in favour of the stored one.
          cutovers: [{ accountId: bankId, effectiveAt: LedgerDate.fromEpochMs(0) }],
        },
        occurredAtMs,
        sourceEventIds: [asSourceEventId("csv-1")],
        actor: "import",
      });
    await expect(historical(effective, "h1", "tx-h1")).rejects.toThrow(code("beforeCutover"));
    await expect(historical(effective - 30 * DAY, "h2", "tx-h2")).rejects.toThrow(
      code("beforeCutover"),
    );
    expect(await w.ledger.getBalance(alice, bankId)).toBe(100_000);
    expect((await historical(effective + DAY, "h3", "tx-h3")).status).toBe("committed");
    expect(await w.ledger.getBalance(alice, bankId)).toBe(99_700);

    // Moving the cutover through a correction moves the boundary for later imports.
    await correctOpening(120_000, effective + 10 * DAY);
    await expect(historical(effective + 5 * DAY, "h4", "tx-h4")).rejects.toThrow(
      code("beforeCutover"),
    );
    expect((await historical(effective + 11 * DAY, "h5", "tx-h5")).status).toBe("committed");
  });

  it("gate 33: a corrected opening keeps the original evidence and audit, and cannot be replayed", async () => {
    await record(100_000);
    const corrected = await correctOpening(120_000, effective);
    expect(corrected).toEqual({ status: "committed", transactionId: "opening-bank-1:rev" });
    expect(await w.ledger.getBalance(alice, bankId)).toBe(120_000);
    expect(await w.ledger.getBalance(alice, nominal.openingEquity("BDT").id)).toBe(-120_000);

    const original = asTransactionId("opening-bank-1");
    expect(await w.ledger.getTransaction(alice, original)).toMatchObject({
      state: "reversed",
      reversedBy: "opening-bank-1:rev",
      actor: "user",
      intentType: "openingBalance",
    });
    expect(await w.ledger.getEntries(alice, original)).toHaveLength(2);
    expect(
      await w.ledger.getTransaction(alice, asTransactionId("opening-bank-1:rev")),
    ).toMatchObject({
      correctionOf: "opening-bank-1",
      actor: "user",
      rationale: "statement showed a different figure",
    });
    expect(
      await w.ledger.getTransaction(alice, asTransactionId("opening-bank-1:repl")),
    ).toMatchObject({ state: "posted", intentType: "openingBalance", occurredAtMs: effective });

    // The old request no longer reads as success, with the old or the new values.
    expect(await record(100_000)).toEqual({ status: "idempotencyConflict" });
    expect(await record(120_000)).toEqual({ status: "idempotencyConflict" });
    expect(await w.ledger.getBalance(alice, bankId)).toBe(120_000);
  });

  it("a correction moves the marker and keeps the replacement's effective date", async () => {
    await record(100_000);
    await correctOpening(100_000, effective - 3 * DAY);
    const [marker] = await w.ledger.getCutoverMarkers(alice, [bankId]);
    expect(marker?.effectiveAt.epochMs).toBe(effective - 3 * DAY);
    expect(
      (await w.ledger.getTransaction(alice, asTransactionId("opening-bank-1:repl")))?.occurredAtMs,
    ).toBe(effective - 3 * DAY);
  });

  it("a zero opening can be corrected to a balance and back to zero", async () => {
    await record(0);
    expect((await correctOpening(50_000, effective)).status).toBe("committed");
    expect(await w.ledger.getBalance(alice, bankId)).toBe(50_000);
    const again = await reverser().execute({
      ownerId: alice,
      idempotencyKey: asIdempotencyKey("fix-2"),
      originalTransactionId: asTransactionId("opening-bank-1:repl"),
      replacement: {
        type: "openingBalance",
        account: bank,
        amount: bdt(0),
        effectiveAt: LedgerDate.fromEpochMs(effective),
      },
      actor: "user",
      rationale: "was zero after all",
    });
    expect(again.status).toBe("committed");
    expect(await w.ledger.getBalance(alice, bankId)).toBe(0);
    expect(await w.ledger.getCutoverMarkers(alice, [bankId])).toHaveLength(1);
  });
});
