import { Money, asAccountId, asIdempotencyKey, asOwnerId, asTransactionId } from "@moneytrace/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeClock, TestHasher } from "../testing/fakes";
import { InMemoryMerchantSectors } from "../testing/in-memory-merchant-sectors";
import { InMemoryAccountRepository, InMemoryLedger } from "../testing/in-memory-ledger";
import { PostTransaction } from "./post-transaction";
import { TagMerchant } from "./tag-merchant";

const alice = asOwnerId("alice");
const bank = { id: asAccountId("bank"), kind: "bank" as const, currency: "BDT" as const };
const T = Date.parse("2026-11-10T06:00:00Z");

let ledger: InMemoryLedger;
let sectors: InMemoryMerchantSectors;
let tag: TagMerchant;
let n = 0;

async function spend(minor: number, merchant = { name: "Foodpanda", key: "foodpanda" }, category = "uncategorized") {
  n += 1;
  const id = `tx-${String(n)}`;
  await new PostTransaction({ writer: ledger, accounts: shared, hasher: new TestHasher(), clock: new FakeClock(T) }).execute({
    ownerId: alice,
    idempotencyKey: asIdempotencyKey(`k-${id}`),
    transactionId: asTransactionId(id),
    intent: { type: "purchase", funding: bank, category, amount: Money.ofMinor(minor, "BDT") },
    occurredAtMs: T,
    sourceEventIds: [],
    actor: "pipeline",
    merchant,
  });
  return id;
}

let shared: InMemoryAccountRepository;

beforeEach(async () => {
  ledger = new InMemoryLedger();
  sectors = new InMemoryMerchantSectors();
  shared = new InMemoryAccountRepository();
  await shared.ensure(alice, { id: bank.id, kind: "bank", name: "Bank", currency: "BDT", status: "active", createdAtMs: 1 });
  tag = new TagMerchant({ merchantSectors: sectors, reader: ledger, writer: ledger, accounts: shared, hasher: new TestHasher(), clock: new FakeClock(T) });
});

const run = (sector: string) => tag.execute({ ownerId: alice, merchantKey: "foodpanda", merchantName: "Foodpanda", sector });

describe("TagMerchant", () => {
  it("re-sorts every earlier spend from the merchant, keeping amount and merchant", async () => {
    const ids = [await spend(100_000), await spend(50_000), await spend(25_000)];
    expect(await run("food")).toEqual({ resorted: 3, more: false });
    for (const id of ids) {
      expect((await ledger.getTransaction(alice, asTransactionId(id)))?.state).toBe("reversed");
      expect(await ledger.getTransaction(alice, asTransactionId(`${id}:repl`))).toMatchObject({ category: "food", merchant: "Foodpanda", merchantKey: "foodpanda" });
    }
    expect(await ledger.getBalance(alice, asAccountId("nominal:expense:food:BDT"))).toBe(175_000);
    expect(await ledger.getBalance(alice, asAccountId("nominal:expense:uncategorized:BDT"))).toBe(0);
    expect(await ledger.getBalance(alice, bank.id)).toBe(-175_000);
  });

  it("remembers the tag for later SMS", async () => {
    await run("food");
    expect(await sectors.get(alice, "foodpanda")).toMatchObject({ sector: "food", merchantName: "Foodpanda" });
  });

  it("running it again changes nothing", async () => {
    await spend(100_000);
    await run("food");
    expect(await run("food")).toEqual({ resorted: 0, more: false });
    expect(await ledger.getBalance(alice, asAccountId("nominal:expense:food:BDT"))).toBe(100_000);
  });

  it("re-tagging moves already sorted spending to the new sector", async () => {
    await spend(100_000);
    await run("food");
    expect(await run("health")).toEqual({ resorted: 1, more: false });
    expect(await ledger.getBalance(alice, asAccountId("nominal:expense:health:BDT"))).toBe(100_000);
    expect(await ledger.getBalance(alice, asAccountId("nominal:expense:food:BDT"))).toBe(0);
  });

  it("leaves other merchants alone", async () => {
    await spend(100_000, { name: "Daraz", key: "daraz" });
    expect(await run("food")).toEqual({ resorted: 0, more: false });
  });

  it("works in batches of 20 and says when more remain", async () => {
    for (let i = 0; i < 25; i++) await spend(1_000);
    expect(await run("food")).toEqual({ resorted: 20, more: true });
    expect(await run("food")).toEqual({ resorted: 5, more: false });
    expect(await ledger.getBalance(alice, asAccountId("nominal:expense:food:BDT"))).toBe(25_000);
  });

  it("refuses an unknown sector", async () => {
    await expect(run("toys")).rejects.toMatchObject({ code: "invalidIntent" });
  });
});
