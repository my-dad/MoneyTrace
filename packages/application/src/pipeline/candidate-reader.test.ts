import {
  Money,
  asAccountId,
  asIdempotencyKey,
  asOwnerId,
  asSourceEventId,
  asTransactionId,
  type AccountRef,
  type PostingIntent,
} from "@moneytrace/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { createWorld } from "../testing/world";
import { PostTransaction } from "../use-cases/post-transaction";
import { ReverseAndReplace } from "../use-cases/reverse-and-replace";
import { LedgerCandidateReader } from "./candidate-reader";

const alice = asOwnerId("alice");
const bob = asOwnerId("bob");
const T = 1_700_000_000_000;
const ref = (id: string, kind: AccountRef["kind"]): AccountRef => ({
  id: asAccountId(id),
  kind,
  currency: "BDT",
});
const bank = ref("bank-1", "bank");
const card = ref("card-1", "creditLiability");
const bdt = (n: number) => Money.ofMinor(n, "BDT");

let w: ReturnType<typeof createWorld>;
let reader: LedgerCandidateReader;

const post = (id: string, intent: PostingIntent, at = T, reference?: string, owner = alice) =>
  new PostTransaction({
    writer: w.ledger,
    accounts: w.accounts,
    hasher: w.hasher,
    clock: w.clock,
  }).execute({
    ownerId: owner,
    idempotencyKey: asIdempotencyKey(id),
    transactionId: asTransactionId(id),
    intent,
    occurredAtMs: at,
    sourceEventIds: [asSourceEventId("e")],
    actor: "user",
    ...(reference === undefined ? {} : { reference }),
  });

const purchase = (amount = 500): PostingIntent => ({
  type: "purchase",
  funding: bank,
  category: "groceries",
  amount: bdt(amount),
});

const query = { amountMinor: 500, currency: "BDT", fromMs: T - 1000, toMs: T + 1000 };

beforeEach(async () => {
  w = createWorld();
  reader = new LedgerCandidateReader(w.ledger);
  for (const owner of [alice, bob]) {
    for (const a of [bank, card]) {
      await w.accounts.create(owner, {
        id: a.id,
        kind: a.kind as "bank",
        name: a.id,
        currency: "BDT",
        status: "active",
        createdAtMs: 1,
      });
    }
  }
});

describe("LedgerCandidateReader", () => {
  it("returns a posted transaction on its real account, with direction and reference", async () => {
    await post("t1", purchase(), T, "REF1");
    expect(await reader.findRecent(alice, query)).toEqual([
      {
        transactionId: "t1",
        state: "posted",
        accountId: "bank-1",
        direction: "out",
        amountMinor: 500,
        currency: "BDT",
        occurredAtMs: T,
        reference: "REF1",
        isAuthorization: false,
      },
    ]);
  });

  it("a card repayment is out of the bank and into the card", async () => {
    await post("t1", { type: "cardRepayment", bank, card, amount: bdt(500) });
    const rows = await reader.findRecent(alice, query);
    expect(rows.map((r) => [r.accountId, r.direction]).sort()).toEqual([
      ["bank-1", "out"],
      ["card-1", "in"],
    ]);
  });

  it("ignores another amount, currency, time and owner", async () => {
    await post("t1", purchase(501));
    await post("t2", purchase(), T + 5000);
    await post("t3", purchase(), T, undefined, bob);
    expect(await reader.findRecent(alice, query)).toEqual([]);
    expect(await reader.findRecent(alice, { ...query, currency: "USD" })).toEqual([]);
  });

  it("returns a reversed transaction's replacement, not the original or its reversal", async () => {
    await post("t1", purchase());
    await new ReverseAndReplace({
      writer: w.ledger,
      reader: w.ledger,
      accounts: w.accounts,
      hasher: w.hasher,
      clock: w.clock,
    }).execute({
      ownerId: alice,
      idempotencyKey: asIdempotencyKey("c1"),
      originalTransactionId: asTransactionId("t1"),
      replacement: purchase(),
      actor: "user",
      rationale: "category",
    });
    const rows = await reader.findRecent(alice, query);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.transactionId).not.toBe("t1");
    expect(rows[0]?.direction).toBe("out");
  });
});
