import { beforeEach, describe, expect, it } from "vitest";
import {
  Money,
  asAccountId,
  asIdempotencyKey,
  asOwnerId,
  asSourceEventId,
  asTransactionId,
  nominal,
  type AccountRef,
  type PostingIntent,
} from "@moneytrace/domain";
import { createWorld } from "../testing/world";
import { PostTransaction } from "./post-transaction";
import { ReverseAndReplace } from "./reverse-and-replace";

const alice = asOwnerId("alice");
const bdt = (n: number): Money => Money.ofMinor(n, "BDT");
const code = (c: string): Error => expect.objectContaining({ code: c }) as Error;
const ref = (id: string, kind: AccountRef["kind"]): AccountRef => ({
  id: asAccountId(id),
  kind,
  currency: "BDT",
});
const bank = ref("bank-1", "bank");
const cash = ref("cash-1", "cash");
const tx1 = asTransactionId("tx-1");

let w: ReturnType<typeof createWorld>;
let reverse: ReverseAndReplace;

const purchase = (n: number): PostingIntent => ({
  type: "purchase",
  funding: cash,
  category: "food",
  amount: bdt(n),
});

const correct = (key: string, replacement: PostingIntent | null, rationale = "wrong amount") =>
  reverse.execute({
    ownerId: alice,
    idempotencyKey: asIdempotencyKey(key),
    originalTransactionId: tx1,
    replacement,
    actor: "user",
    rationale,
  });

beforeEach(async () => {
  w = createWorld();
  const deps = {
    writer: w.ledger,
    reader: w.ledger,
    accounts: w.accounts,
    hasher: w.hasher,
    clock: w.clock,
  };
  reverse = new ReverseAndReplace({ ...deps, reader: w.ledger });
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
  await new PostTransaction(deps).execute({
    ownerId: alice,
    idempotencyKey: asIdempotencyKey("k1"),
    transactionId: tx1,
    intent: purchase(1_000),
    occurredAtMs: 1_700_000_000_000,
    sourceEventIds: [],
    actor: "user",
  });
});

describe("ReverseAndReplace", () => {
  it("reverses and replaces, keeping actor, rationale and links", async () => {
    const result = await correct("c1", purchase(700));
    expect(result).toEqual({ status: "committed", transactionId: "tx-1:rev" });
    expect(await w.ledger.getTransaction(alice, tx1)).toMatchObject({
      state: "reversed",
      reversedBy: "tx-1:rev",
    });
    expect(await w.ledger.getTransaction(alice, asTransactionId("tx-1:rev"))).toMatchObject({
      state: "posted",
      correctionOf: "tx-1",
      actor: "user",
      rationale: "wrong amount",
      intentType: "purchase",
    });
    expect(await w.ledger.getTransaction(alice, asTransactionId("tx-1:repl"))).toMatchObject({
      state: "posted",
      correctionOf: "tx-1",
      actor: "user",
      rationale: "wrong amount",
    });
    expect(await w.ledger.getBalance(alice, cash.id)).toBe(-700);
    expect(await w.ledger.getBalance(alice, nominal.expense("food", "BDT").id)).toBe(700);
  });

  it("replacement null is a pure reversal", async () => {
    await correct("c1", null);
    expect(await w.ledger.getBalance(alice, cash.id)).toBe(0);
    expect(await w.ledger.getBalance(alice, nominal.expense("food", "BDT").id)).toBe(0);
    expect(await w.ledger.getTransaction(alice, asTransactionId("tx-1:repl"))).toBeNull();
  });

  it("rejects a blank rationale before any write", async () => {
    await expect(correct("c1", null, "  ")).rejects.toThrow(code("invalidIntent"));
    expect((await w.ledger.getTransaction(alice, tx1))?.state).toBe("posted");
  });

  it("replays the same correction as a duplicate", async () => {
    await correct("c1", purchase(700));
    expect(await correct("c1", purchase(700))).toEqual({
      status: "duplicate",
      transactionId: "tx-1:rev",
    });
    expect(await w.ledger.getBalance(alice, cash.id)).toBe(-700);
  });

  it("returns idempotencyConflict for the same key with another replacement", async () => {
    await correct("c1", purchase(700));
    expect(await correct("c1", purchase(800))).toEqual({ status: "idempotencyConflict" });
    expect(await w.ledger.getBalance(alice, cash.id)).toBe(-700);
  });

  it("rejects a second correction of the same original under a new key", async () => {
    await correct("c1", purchase(700));
    await expect(correct("c2", purchase(900))).rejects.toThrow(code("invalidTransition"));
    expect(await w.ledger.getBalance(alice, cash.id)).toBe(-700);
  });

  it("rejects reversing the reversal itself", async () => {
    await correct("c1", purchase(700));
    await expect(
      reverse.execute({
        ownerId: alice,
        idempotencyKey: asIdempotencyKey("c2"),
        originalTransactionId: asTransactionId("tx-1:rev"),
        replacement: null,
        actor: "user",
        rationale: "undo",
      }),
    ).rejects.toThrow(code("invalidTransition"));
    expect(await w.ledger.getBalance(alice, cash.id)).toBe(-700);
  });

  it("allows correcting the replacement", async () => {
    await correct("c1", purchase(700));
    await reverse.execute({
      ownerId: alice,
      idempotencyKey: asIdempotencyKey("c2"),
      originalTransactionId: asTransactionId("tx-1:repl"),
      replacement: purchase(650),
      actor: "user",
      rationale: "again",
    });
    expect(await w.ledger.getBalance(alice, cash.id)).toBe(-650);
  });

  it("rejects an unknown original and a replacement on an invalid account", async () => {
    await expect(
      reverse.execute({
        ownerId: alice,
        idempotencyKey: asIdempotencyKey("c1"),
        originalTransactionId: asTransactionId("nope"),
        replacement: null,
        actor: "user",
        rationale: "x",
      }),
    ).rejects.toThrow(code("invalidTransition"));
    await expect(
      correct("c2", {
        type: "purchase",
        funding: ref("ghost", "cash"),
        category: "food",
        amount: bdt(5),
      }),
    ).rejects.toThrow(code("accountInvalid"));
    expect((await w.ledger.getTransaction(alice, tx1))?.state).toBe("posted");
  });

  it("rejects reversing a pending transaction", async () => {
    await w.ledger.savePending(alice, {
      id: asTransactionId("tx-p"),
      state: "pending",
      intentType: "purchase",
      occurredAtMs: 1,
      currency: "BDT",
      sourceEventIds: [],
      actor: "user",
      committedAtMs: 1,
    });
    await expect(
      reverse.execute({
        ownerId: alice,
        idempotencyKey: asIdempotencyKey("c1"),
        originalTransactionId: asTransactionId("tx-p"),
        replacement: null,
        actor: "user",
        rationale: "x",
      }),
    ).rejects.toThrow(code("invalidTransition"));
  });

  it("carries the original's category, reference and evidence onto the reversal and replacement", async () => {
    const tx2 = asTransactionId("tx-2");
    await new PostTransaction({ writer: w.ledger, accounts: w.accounts, hasher: w.hasher, clock: w.clock }).execute({
      ownerId: alice,
      idempotencyKey: asIdempotencyKey("k2"),
      transactionId: tx2,
      intent: purchase(2_000),
      occurredAtMs: 1_700_000_000_000,
      sourceEventIds: [asSourceEventId("e1")],
      reference: "REF-9",
      actor: "user",
    });
    await reverse.execute({
      ownerId: alice,
      idempotencyKey: asIdempotencyKey("c2"),
      originalTransactionId: tx2,
      replacement: purchase(2_100),
      actor: "user",
      rationale: "receipt says 2,100",
    });
    for (const id of ["tx-2:rev", "tx-2:repl"]) {
      const tx = await w.ledger.getTransaction(alice, asTransactionId(id));
      expect(tx).toMatchObject({ category: "food", reference: "REF-9", sourceEventIds: ["e1"] });
    }
  });
});
