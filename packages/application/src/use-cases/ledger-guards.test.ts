import { beforeEach, describe, expect, it } from "vitest";
import {
  LedgerDate,
  Money,
  asAccountId,
  asIdempotencyKey,
  asOwnerId,
  asSourceEventId,
  asTransactionId,
  type AccountRef,
  type PostingIntent,
} from "@moneytrace/domain";
import { createWorld } from "../testing/world";
import type { LedgerCommitResult } from "../ports/ledger-writer";
import { PostTransaction } from "./post-transaction";
import { RecordOpeningBalance } from "./record-opening-balance";
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
const family = ref("family-1", "familyCash");
const DAY = 86_400_000;
const effective = 1_700_000_000_000;
const tx = asTransactionId;
const key = asIdempotencyKey;

let w: ReturnType<typeof createWorld>;
let post: PostTransaction;
let reverse: ReverseAndReplace;
let opening: RecordOpeningBalance;

const postIntent = (
  intent: PostingIntent,
  over: { key?: string; txId?: string; actor?: string; occurredAtMs?: number } = {},
): Promise<LedgerCommitResult> =>
  post.execute({
    ownerId: alice,
    idempotencyKey: key(over.key ?? "k1"),
    transactionId: tx(over.txId ?? "tx-1"),
    intent,
    occurredAtMs: over.occurredAtMs ?? effective + 20 * DAY,
    sourceEventIds: [asSourceEventId("evt-1")],
    actor: over.actor ?? "user",
  });

const correct = (
  originalId: string,
  replacement: PostingIntent | null,
  over: { key?: string; actor?: string; rationale?: string; occurredAtMs?: number } = {},
): Promise<LedgerCommitResult> =>
  reverse.execute({
    ownerId: alice,
    idempotencyKey: key(over.key ?? "c1"),
    originalTransactionId: tx(originalId),
    replacement,
    actor: over.actor ?? "user",
    rationale: over.rationale ?? "fix",
    ...(over.occurredAtMs === undefined ? {} : { occurredAtMs: over.occurredAtMs }),
  });

const openingIntent = (account: AccountRef, amount: number, atMs = effective): PostingIntent => ({
  type: "openingBalance",
  account,
  amount: bdt(amount),
  effectiveAt: LedgerDate.fromEpochMs(atMs),
});

const adjustment = (cause: string, authorizedBy = "Mabrur"): PostingIntent => ({
  type: "adjustment",
  account: cash,
  direction: "decrease",
  amount: bdt(50),
  cause,
  authorizedBy,
});

const custody = (holderName: string): PostingIntent => ({
  type: "cashCustodyTransfer",
  from: cash,
  to: family,
  amount: bdt(200),
  holderName,
});

const historical = (occurredAtMs: number, cutoverMs = 0): PostingIntent => ({
  type: "historicalImport",
  inner: { type: "purchase", funding: bank, category: "food", amount: bdt(300) },
  occurredAt: LedgerDate.fromEpochMs(occurredAtMs),
  cutovers: [{ accountId: bank.id, effectiveAt: LedgerDate.fromEpochMs(cutoverMs) }],
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
  post = new PostTransaction(deps);
  reverse = new ReverseAndReplace(deps);
  opening = new RecordOpeningBalance(deps);
  for (const a of [bank, cash, family]) {
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

const openBank = (amount = 100_000) =>
  opening.execute({
    ownerId: alice,
    accountId: bank.id,
    amount: bdt(amount),
    effectiveAtMs: effective,
    actor: "user",
  });

describe("opening balances only change through their own correction", () => {
  it("rejects replacing an ordinary transaction with an opening balance", async () => {
    await openBank();
    await postIntent({ type: "purchase", funding: cash, category: "food", amount: bdt(10) });
    await expect(correct("tx-1", openingIntent(bank, 50_000))).rejects.toThrow(
      code("invalidIntent"),
    );
    expect(await w.ledger.getBalance(alice, bank.id)).toBe(100_000);
    expect((await w.ledger.getTransaction(alice, tx("tx-1")))?.state).toBe("posted");
  });

  it("rejects replacing an opening with an opening on another account", async () => {
    await openBank();
    await expect(correct("opening-bank-1", openingIntent(cash, 40_000))).rejects.toThrow(
      code("invalidIntent"),
    );
    expect(await w.ledger.getBalance(alice, bank.id)).toBe(100_000);
    expect(await w.ledger.getBalance(alice, cash.id)).toBe(0);
  });

  it("rejects replacing an opening with an ordinary intent, or with nothing", async () => {
    await openBank();
    await expect(
      correct("opening-bank-1", {
        type: "purchase",
        funding: bank,
        category: "food",
        amount: bdt(5),
      }),
    ).rejects.toThrow(code("invalidIntent"));
    await expect(correct("opening-bank-1", null)).rejects.toThrow(code("invalidIntent"));
    expect(await w.ledger.getBalance(alice, bank.id)).toBe(100_000);
    expect(await w.ledger.getCutoverMarkers(alice, [bank.id])).toHaveLength(1);
  });

  it("rejects an explicit date on an opening replacement", async () => {
    await openBank();
    await expect(
      correct("opening-bank-1", openingIntent(bank, 5), { occurredAtMs: effective + DAY }),
    ).rejects.toThrow(code("invalidIntent"));
  });

  it("an opening cannot be posted through PostTransaction", async () => {
    await expect(postIntent(openingIntent(bank, 5))).rejects.toThrow(code("invalidIntent"));
  });
});

describe("historical imports use stored markers (gate 36)", () => {
  beforeEach(async () => {
    await openBank();
  });

  it("ignores caller-supplied cutovers and refuses a date before the stored marker", async () => {
    const early = effective - 30 * DAY;
    await expect(postIntent(historical(early), { occurredAtMs: early })).rejects.toThrow(
      code("beforeCutover"),
    );
    expect(await w.ledger.getBalance(alice, bank.id)).toBe(100_000);
  });

  it("refuses an import for an account with no stored marker", async () => {
    await expect(
      postIntent(
        {
          type: "historicalImport",
          occurredAt: LedgerDate.fromEpochMs(effective + DAY),
          cutovers: [],
          inner: { type: "purchase", funding: cash, category: "food", amount: bdt(3) },
        },
        { occurredAtMs: effective + DAY },
      ),
    ).rejects.toThrow(code("beforeCutover"));
  });

  it("requires occurredAt to equal the transaction's occurredAtMs", async () => {
    await expect(
      postIntent(historical(effective + DAY), { occurredAtMs: effective - 30 * DAY }),
    ).rejects.toThrow(code("invalidIntent"));
    expect(await w.ledger.getBalance(alice, bank.id)).toBe(100_000);
  });

  it("applies to a replacement in ReverseAndReplace too", async () => {
    await postIntent(
      { type: "purchase", funding: bank, category: "food", amount: bdt(10) },
      { occurredAtMs: effective + DAY },
    );
    const early = effective - 30 * DAY;
    await expect(correct("tx-1", historical(early), { occurredAtMs: early })).rejects.toThrow(
      code("beforeCutover"),
    );
    await expect(
      correct("tx-1", historical(effective + 2 * DAY), { occurredAtMs: early }),
    ).rejects.toThrow(code("invalidIntent"));
    expect((await w.ledger.getTransaction(alice, tx("tx-1")))?.state).toBe("posted");
    expect(
      (
        await correct("tx-1", historical(effective + 2 * DAY), {
          occurredAtMs: effective + 2 * DAY,
        })
      ).status,
    ).toBe("committed");
  });
});

describe("payload hash covers everything that changes meaning", () => {
  beforeEach(async () => {
    await openBank();
  });

  it.each([
    ["cause", adjustment("short"), adjustment("stolen")],
    ["authorizedBy", adjustment("short", "Mabrur"), adjustment("short", "Someone")],
    ["holderName", custody("Mother"), custody("Father")],
  ])("conflicts when %s changes under the same key", async (_n, a, b) => {
    await postIntent(a);
    expect(await postIntent(b)).toEqual({ status: "idempotencyConflict" });
    expect(await postIntent(a)).toMatchObject({ status: "duplicate" });
  });

  it("conflicts when the actor or occurredAtMs changes under the same key", async () => {
    const purchase: PostingIntent = {
      type: "purchase",
      funding: cash,
      category: "food",
      amount: bdt(10),
    };
    await postIntent(purchase);
    expect(await postIntent(purchase, { actor: "other" })).toEqual({
      status: "idempotencyConflict",
    });
    expect(await postIntent(purchase, { occurredAtMs: effective + 21 * DAY })).toEqual({
      status: "idempotencyConflict",
    });
  });

  it("conflicts when a historical import's date changes under the same key", async () => {
    const day = effective + 5 * DAY;
    await postIntent(historical(day), { occurredAtMs: day });
    expect(await postIntent(historical(day + DAY), { occurredAtMs: day + DAY })).toEqual({
      status: "idempotencyConflict",
    });
  });

  it("does not let caller-supplied cutovers change the hash", async () => {
    const day = effective + 5 * DAY;
    await postIntent(historical(day, 0), { occurredAtMs: day });
    expect(await postIntent(historical(day, effective - DAY), { occurredAtMs: day })).toMatchObject(
      {
        status: "duplicate",
      },
    );
  });

  describe("corrections", () => {
    const purchase = (n: number): PostingIntent => ({
      type: "purchase",
      funding: cash,
      category: "food",
      amount: bdt(n),
    });
    beforeEach(async () => {
      await postIntent(purchase(100));
    });

    it("conflicts on a changed rationale, actor, replacement date, or replacement audit", async () => {
      await correct("tx-1", adjustment("short"), { occurredAtMs: effective + 21 * DAY });
      const same = { occurredAtMs: effective + 21 * DAY };
      expect(await correct("tx-1", adjustment("short"), { ...same, rationale: "other" })).toEqual({
        status: "idempotencyConflict",
      });
      expect(await correct("tx-1", adjustment("short"), { ...same, actor: "other" })).toEqual({
        status: "idempotencyConflict",
      });
      expect(
        await correct("tx-1", adjustment("short"), { occurredAtMs: effective + 22 * DAY }),
      ).toEqual({
        status: "idempotencyConflict",
      });
      expect(await correct("tx-1", adjustment("stolen"), same)).toEqual({
        status: "idempotencyConflict",
      });
      expect(await correct("tx-1", adjustment("short", "Someone"), same)).toEqual({
        status: "idempotencyConflict",
      });
      expect(await correct("tx-1", adjustment("short"), same)).toMatchObject({
        status: "duplicate",
      });
    });

    it("conflicts on a changed opening effective date under the same key", async () => {
      await correct("opening-bank-1", openingIntent(bank, 90_000, effective + DAY));
      expect(
        await correct("opening-bank-1", openingIntent(bank, 90_000, effective + 2 * DAY)),
      ).toEqual({
        status: "idempotencyConflict",
      });
    });
  });
});

describe("replacement date", () => {
  it("defaults to the original's date and can be corrected", async () => {
    const date = effective + 20 * DAY;
    await postIntent({ type: "purchase", funding: cash, category: "food", amount: bdt(100) });
    await correct("tx-1", { type: "purchase", funding: cash, category: "food", amount: bdt(100) });
    expect((await w.ledger.getTransaction(alice, tx("tx-1:repl")))?.occurredAtMs).toBe(date);
    await correct(
      "tx-1:repl",
      { type: "purchase", funding: cash, category: "food", amount: bdt(100) },
      {
        key: "c2",
        occurredAtMs: date - 3 * DAY,
      },
    );
    const fixed = await w.ledger.getTransaction(alice, tx("tx-1:repl:repl"));
    expect(fixed?.occurredAtMs).toBe(date - 3 * DAY);
    expect((await w.ledger.getEntries(alice, tx("tx-1:repl:repl")))[0]?.occurredAtMs).toBe(
      date - 3 * DAY,
    );
  });

  it("rejects a malformed date", async () => {
    await postIntent({ type: "purchase", funding: cash, category: "food", amount: bdt(100) });
    await expect(
      correct(
        "tx-1",
        { type: "purchase", funding: cash, category: "food", amount: bdt(100) },
        { occurredAtMs: 1.5 },
      ),
    ).rejects.toThrow(code("invalidDate"));
  });
});

describe("blank actor", () => {
  it("is rejected by all three posting use cases", async () => {
    await expect(
      postIntent(
        { type: "purchase", funding: cash, category: "food", amount: bdt(1) },
        { actor: "  " },
      ),
    ).rejects.toThrow(code("invalidIntent"));
    await openBank();
    await postIntent({ type: "purchase", funding: cash, category: "food", amount: bdt(1) });
    await expect(correct("tx-1", null, { actor: "" })).rejects.toThrow(code("invalidIntent"));
    expect(await w.ledger.getTransaction(alice, tx("tx-1:rev"))).toBeNull();
    await expect(
      opening.execute({
        ownerId: alice,
        accountId: cash.id,
        amount: bdt(1),
        effectiveAtMs: effective,
        actor: "",
      }),
    ).rejects.toThrow(code("invalidIntent"));
  });
});
