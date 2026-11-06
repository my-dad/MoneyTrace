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
  type PostingIntent,
} from "@moneytrace/domain";
import { createWorld } from "../testing/world";
import { PostTransaction } from "./post-transaction";

const alice = asOwnerId("alice");
const bob = asOwnerId("bob");
const bdt = (n: number): Money => Money.ofMinor(n, "BDT");
const code = (c: string): Error => expect.objectContaining({ code: c }) as Error;
const ref = (id: string, kind: AccountRef["kind"]): AccountRef => ({
  id: asAccountId(id),
  kind,
  currency: "BDT",
});
const bank = ref("bank-1", "bank");
const cash = ref("cash-1", "cash");
const family = ref("family-1", "familyCash");
const card = ref("card-1", "creditLiability");

let w: ReturnType<typeof createWorld>;
let post: PostTransaction;

const withdrawal = (amount = 500_000): PostingIntent => ({
  type: "withdrawal",
  bank,
  cash,
  amount: bdt(amount),
});

const run = (intent: PostingIntent, key = "k1", txId = "tx-1", owner = alice) =>
  post.execute({
    ownerId: owner,
    idempotencyKey: asIdempotencyKey(key),
    transactionId: asTransactionId(txId),
    intent,
    occurredAtMs: 1_700_000_000_000,
    sourceEventIds: [asSourceEventId("evt-1")],
    actor: "user",
  });

beforeEach(async () => {
  w = createWorld();
  post = new PostTransaction({
    writer: w.ledger,
    reader: w.ledger,
    accounts: w.accounts,
    hasher: w.hasher,
    clock: w.clock,
  });
  for (const a of [bank, cash, family, card]) {
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

describe("PostTransaction", () => {
  it("posts a withdrawal as a custody move, never an expense", async () => {
    const result = await run(withdrawal());
    expect(result).toEqual({ status: "committed", transactionId: "tx-1" });
    expect(await w.ledger.getBalance(alice, bank.id)).toBe(-500_000);
    expect(await w.ledger.getBalance(alice, cash.id)).toBe(500_000);
    expect(await w.ledger.getBalance(alice, nominal.expense("food", "BDT").id)).toBe(0);
    expect(await w.ledger.getTransaction(alice, asTransactionId("tx-1"))).toMatchObject({
      state: "posted",
      intentType: "withdrawal",
      currency: "BDT",
      actor: "user",
      sourceEventIds: ["evt-1"],
      committedAtMs: w.clock.nowMs(),
    });
  });

  it("returns duplicate for a replay and idempotencyConflict for a changed amount", async () => {
    await run(withdrawal());
    expect(await run(withdrawal())).toEqual({ status: "duplicate", transactionId: "tx-1" });
    expect(await run(withdrawal(600_000))).toEqual({ status: "idempotencyConflict" });
    expect(await w.ledger.getBalance(alice, cash.id)).toBe(500_000);
  });

  it("treats a card purchase as expense plus liability, and repayment as no expense", async () => {
    await run({ type: "cardPurchase", card, category: "food", amount: bdt(1_000) });
    await run({ type: "cardRepayment", bank, card, amount: bdt(400) }, "k2", "tx-2");
    expect(await w.ledger.getBalance(alice, nominal.expense("food", "BDT").id)).toBe(1_000);
    expect(await w.ledger.getBalance(alice, card.id)).toBe(-600);
    expect(await w.ledger.getBalance(alice, bank.id)).toBe(-400);
  });

  it("keeps cause and authorizer of an adjustment as audit details", async () => {
    await run({
      type: "adjustment",
      account: cash,
      direction: "decrease",
      amount: bdt(50),
      cause: "counted short",
      authorizedBy: "Mabrur",
    });
    const stored = await w.ledger.getTransaction(alice, asTransactionId("tx-1"));
    expect(stored?.auditDetails).toEqual({ cause: "counted short", authorizedBy: "Mabrur" });
  });

  it("keeps the holder of a custody transfer as audit details", async () => {
    await run({
      type: "cashCustodyTransfer",
      from: cash,
      to: family,
      amount: bdt(200),
      holderName: "Mother",
    });
    const stored = await w.ledger.getTransaction(alice, asTransactionId("tx-1"));
    expect(stored?.auditDetails).toEqual({ holderName: "Mother" });
    expect(await w.ledger.getBalance(alice, nominal.expense("food", "BDT").id)).toBe(0);
  });

  it("stores no audit details for intents that have none", async () => {
    await run(withdrawal());
    const stored = await w.ledger.getTransaction(alice, asTransactionId("tx-1"));
    expect(stored).not.toHaveProperty("auditDetails");
  });

  it("rejects an unknown account and writes nothing", async () => {
    await expect(
      run({ type: "withdrawal", bank, cash: ref("ghost", "cash"), amount: bdt(5) }),
    ).rejects.toThrow(code("accountInvalid"));
    expect(await w.ledger.getTransaction(alice, asTransactionId("tx-1"))).toBeNull();
    expect(await w.ledger.getBalance(alice, bank.id)).toBe(0);
  });

  it("rejects a closed account", async () => {
    const closed = ref("closed-1", "cash");
    await w.accounts.create(alice, {
      id: closed.id,
      kind: "cash",
      name: "old",
      currency: "BDT",
      status: "closed",
      createdAtMs: 1,
    });
    await expect(run({ type: "withdrawal", bank, cash: closed, amount: bdt(5) })).rejects.toThrow(
      code("accountInvalid"),
    );
    expect(await w.ledger.getTransaction(alice, asTransactionId("tx-1"))).toBeNull();
  });

  it("rejects an account whose kind differs from the stored kind", async () => {
    const wrongKind = { ...cash, kind: "bank" } as AccountRef;
    await expect(
      run({ type: "transfer", from: wrongKind, to: bank, amount: bdt(5) }),
    ).rejects.toThrow(code("accountInvalid"));
    expect(await w.ledger.getBalance(alice, bank.id)).toBe(0);
  });

  it("rejects an account whose currency differs from the stored currency", async () => {
    const usd = { ...cash, currency: "USD" } as unknown as AccountRef;
    const usdMoney = Money.ofMinor(5, "USD" as unknown as "BDT");
    await expect(
      run({
        type: "withdrawal",
        bank: { ...bank, currency: "USD" } as unknown as AccountRef,
        cash: usd,
        amount: usdMoney,
      }),
    ).rejects.toThrow(code("accountInvalid"));
    expect(await w.ledger.getTransaction(alice, asTransactionId("tx-1"))).toBeNull();
  });

  it("treats another owner's account as missing", async () => {
    await expect(run(withdrawal(), "k1", "tx-1", bob)).rejects.toThrow(code("accountInvalid"));
    expect(await w.ledger.getBalance(bob, cash.id)).toBe(0);
    expect(await w.ledger.getBalance(alice, cash.id)).toBe(0);
  });

  it("rejects an opening balance, which needs its cutover marker", async () => {
    await expect(
      run({
        type: "openingBalance",
        account: cash,
        amount: bdt(5),
        effectiveAt: LedgerDate.fromEpochMs(1),
      }),
    ).rejects.toThrow(code("invalidIntent"));
  });

  it("rejects a malformed occurredAtMs", async () => {
    await expect(
      post.execute({
        ownerId: alice,
        idempotencyKey: asIdempotencyKey("k1"),
        transactionId: asTransactionId("tx-1"),
        intent: withdrawal(),
        occurredAtMs: 1.5,
        sourceEventIds: [],
        actor: "user",
      }),
    ).rejects.toThrow(code("invalidDate"));
  });
});
