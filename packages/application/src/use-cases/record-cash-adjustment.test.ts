import { beforeEach, describe, expect, it } from "vitest";
import {
  Money,
  asAccountId,
  asIdempotencyKey,
  asOwnerId,
  asTransactionId,
  nominal,
  type RealAccountKind,
} from "@moneytrace/domain";
import { InMemoryFollowUps } from "../testing/in-memory-follow-ups";
import { InMemoryReconciliations } from "../testing/in-memory-reconciliations";
import { createWorld } from "../testing/world";
import { PostTransaction } from "./post-transaction";
import { RecordCashAdjustment } from "./record-cash-adjustment";
import { RecordCashCount } from "./record-cash-count";

const alice = asOwnerId("alice");
const bob = asOwnerId("bob");
const code = (c: string): Error => expect.objectContaining({ code: c }) as Error;
let w: ReturnType<typeof createWorld>;
let followUps: InMemoryFollowUps;
let reconciliations: InMemoryReconciliations;
let post: PostTransaction;
let count: RecordCashCount;
let adjust: RecordCashAdjustment;

async function account(id: string, kind: RealAccountKind, balance: number): Promise<void> {
  await w.accounts.create(alice, { id: asAccountId(id), kind, name: id, currency: "BDT", status: "active", createdAtMs: 1 });
  await post.execute({
    ownerId: alice,
    idempotencyKey: asIdempotencyKey(`seed-${id}`),
    transactionId: asTransactionId(`txn-seed-${id}`),
    intent: {
      type: "adjustment",
      account: { id: asAccountId(id), kind, currency: "BDT" },
      direction: "increase",
      amount: Money.ofMinor(balance, "BDT"),
      cause: "test seed",
      authorizedBy: "test",
    },
    occurredAtMs: 1_699_000_000_000,
    sourceEventIds: [],
    actor: "test",
  });
}

const counted = (key: string, minor: number) =>
  count.execute({ ownerId: alice, idempotencyKey: key, countedMinor: minor, currency: "BDT" });
const equity = () => w.ledger.getBalance(alice, nominal.adjustmentEquity("BDT").id);
const cashMain = () => w.ledger.getBalance(alice, asAccountId("cash-main"));

beforeEach(async () => {
  w = createWorld();
  followUps = new InMemoryFollowUps();
  reconciliations = new InMemoryReconciliations(followUps);
  const deps = { writer: w.ledger, accounts: w.accounts, hasher: w.hasher, clock: w.clock };
  post = new PostTransaction(deps);
  count = new RecordCashCount({ accounts: w.accounts, reader: w.ledger, reconciliations, followUps, clock: w.clock });
  adjust = new RecordCashAdjustment({ reconciliations, followUps, accounts: w.accounts, reader: w.ledger, post, clock: w.clock });
  await account("cash-main", "cash", 150_000);
  await account("cash-unassigned", "cash", 150_000);
});

describe("RecordCashAdjustment", () => {
  it("adjusting a short count posts a decrease to Cash, not spending", async () => {
    await counted("k1", 230_000);
    const equityBefore = await equity();
    w.clock.advance(60_000);
    const result = await adjust.execute({ ownerId: alice, reconciliationId: "recon-k1", cause: "maybe lost" });
    expect(result).toEqual({
      transactionId: "txn-adjust-recon-k1",
      status: "recorded",
      countedMinor: 230_000,
      adjustmentMinor: 70_000,
    });
    expect(await cashMain()).toBe(80_000);
    expect((await equity()) - equityBefore).toBe(70_000);
    const tx = await w.ledger.getTransaction(alice, asTransactionId("txn-adjust-recon-k1"));
    expect(tx).toMatchObject({
      intentType: "adjustment",
      occurredAtMs: 1_700_000_000_000,
      auditDetails: { cause: "maybe lost", authorizedBy: "alice" },
    });
    const entries = await w.ledger.getEntries(alice, asTransactionId("txn-adjust-recon-k1"));
    expect(entries.some((e) => e.accountKind === "expense")).toBe(false);
    expect(await reconciliations.get(alice, "recon-k1")).toMatchObject({
      reviewStatus: "adjusted",
      adjustmentTransactionIds: ["txn-adjust-recon-k1"],
    });
    expect(await followUps.get(alice, "fu-recon-k1")).toMatchObject({ state: "resolved", resolution: "adjusted" });
  });

  it("adjusting an over count posts an increase", async () => {
    await counted("k1", 310_000);
    const result = await adjust.execute({ ownerId: alice, reconciliationId: "recon-k1", cause: "found a note" });
    expect(result.adjustmentMinor).toBe(10_000);
    expect(await cashMain()).toBe(160_000);
  });

  it("a repeat returns alreadyRecorded and posts once", async () => {
    await counted("k1", 230_000);
    await adjust.execute({ ownerId: alice, reconciliationId: "recon-k1", cause: "maybe lost" });
    const again = await adjust.execute({ ownerId: alice, reconciliationId: "recon-k1", cause: "maybe lost" });
    expect(again).toMatchObject({ transactionId: "txn-adjust-recon-k1", status: "alreadyRecorded", adjustmentMinor: 70_000 });
    expect(await cashMain()).toBe(80_000);
  });

  it("a retry after the posting landed but the count was not yet marked finishes the job", async () => {
    await counted("k1", 230_000);
    const flaky = new RecordCashAdjustment({
      reconciliations: { ...reconciliations, get: reconciliations.get.bind(reconciliations), recordCount: reconciliations.recordCount.bind(reconciliations), listOpenCashCounts: reconciliations.listOpenCashCounts.bind(reconciliations), markStatus: () => Promise.reject(new Error("network")) },
      followUps,
      accounts: w.accounts,
      reader: w.ledger,
      post,
      clock: w.clock,
    });
    await expect(flaky.execute({ ownerId: alice, reconciliationId: "recon-k1", cause: "maybe lost" })).rejects.toThrow("network");
    const retry = await adjust.execute({ ownerId: alice, reconciliationId: "recon-k1", cause: "maybe lost" });
    expect(retry.status).toBe("alreadyRecorded");
    expect(await cashMain()).toBe(80_000);
    expect((await reconciliations.get(alice, "recon-k1"))?.reviewStatus).toBe("adjusted");
    expect((await followUps.get(alice, "fu-recon-k1"))?.state).toBe("resolved");
  });

  it("a superseded count cannot be adjusted", async () => {
    await counted("k1", 230_000);
    await counted("k2", 250_000);
    await expect(adjust.execute({ ownerId: alice, reconciliationId: "recon-k1", cause: "x" })).rejects.toThrow(code("invalidTransition"));
    expect(await w.ledger.getTransaction(alice, asTransactionId("txn-adjust-recon-k1"))).toBeNull();
    expect(await cashMain()).toBe(150_000);
  });

  it("a matching count cannot be adjusted", async () => {
    await counted("k1", 300_000);
    await expect(adjust.execute({ ownerId: alice, reconciliationId: "recon-k1", cause: "x" })).rejects.toThrow(code("invalidTransition"));
  });

  it("a blank cause is refused", async () => {
    await counted("k1", 230_000);
    await expect(adjust.execute({ ownerId: alice, reconciliationId: "recon-k1", cause: "   " })).rejects.toThrow(code("invalidIntent"));
    expect(await cashMain()).toBe(150_000);
  });

  it("another owner's count is not found", async () => {
    await counted("k1", 230_000);
    await expect(adjust.execute({ ownerId: bob, reconciliationId: "recon-k1", cause: "x" })).rejects.toThrow(code("resourceNotFound"));
    expect(await cashMain()).toBe(150_000);
  });
});
