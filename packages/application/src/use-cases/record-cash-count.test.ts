import { beforeEach, describe, expect, it } from "vitest";
import {
  Money,
  asAccountId,
  asIdempotencyKey,
  asOwnerId,
  asTransactionId,
  type RealAccountKind,
} from "@moneytrace/domain";
import { InMemoryFollowUps } from "../testing/in-memory-follow-ups";
import { InMemoryReconciliations } from "../testing/in-memory-reconciliations";
import { createWorld } from "../testing/world";
import { PostTransaction } from "./post-transaction";
import { RecordCashCount } from "./record-cash-count";

const alice = asOwnerId("alice");
let w: ReturnType<typeof createWorld>;
let followUps: InMemoryFollowUps;
let reconciliations: InMemoryReconciliations;
let count: RecordCashCount;

async function account(id: string, kind: RealAccountKind, balance: number): Promise<void> {
  await w.accounts.create(alice, {
    id: asAccountId(id),
    kind,
    name: id,
    currency: "BDT",
    status: "active",
    createdAtMs: 1,
  });
  await new PostTransaction({ writer: w.ledger, accounts: w.accounts, hasher: w.hasher, clock: w.clock }).execute({
    ownerId: alice,
    idempotencyKey: asIdempotencyKey(`seed-${id}`),
    transactionId: asTransactionId(`txn-seed-${id}`),
    // Family-held cash can't receive income, so every seed is an audited increase.
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

const balances = async () =>
  Promise.all(
    ["cash-main", "cash-unassigned", "mom", "bank"].map((id) =>
      w.ledger.getBalance(alice, asAccountId(id)),
    ),
  );

const run = (key: string, countedMinor: number) =>
  count.execute({ ownerId: alice, idempotencyKey: key, countedMinor, currency: "BDT" });

beforeEach(async () => {
  w = createWorld();
  followUps = new InMemoryFollowUps();
  reconciliations = new InMemoryReconciliations(followUps);
  count = new RecordCashCount({
    accounts: w.accounts,
    reader: w.ledger,
    reconciliations,
    followUps,
    clock: w.clock,
  });
  await account("cash-main", "cash", 150_000);
  await account("cash-unassigned", "cash", 150_000);
  await account("mom", "familyCash", 900_000);
  await account("bank", "bank", 5_000_000);
});

describe("RecordCashCount", () => {
  it("a short count shows the gap and changes nothing", async () => {
    const before = await balances();
    const result = await run("k1", 230_000);
    expect(result).toEqual({
      reconciliationId: "recon-k1",
      status: "recorded",
      countedMinor: 230_000,
      expectedMinor: 300_000,
      cashMinor: 150_000,
      unexplainedMinor: 150_000,
      differenceMinor: -70_000,
      followUpId: "fu-recon-k1",
    });
    expect(await balances()).toEqual(before);
    expect(await reconciliations.get(alice, "recon-k1")).toMatchObject({
      accountId: "cash-main",
      kind: "cashCount",
      asOfMs: w.clock.nowMs(),
      statedBalanceMinor: 230_000,
      expectedBalanceMinor: 300_000,
      differenceMinor: -70_000,
      reviewStatus: "open",
    });
    const open = await followUps.listOpen(alice);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      id: "fu-recon-k1",
      trigger: "reconciliationDifference",
      targetAccountId: "cash-main",
      targetReconciliationId: "recon-k1",
      question: "Your cash count was ৳700 less than expected. What explains the difference?",
      dueAtMs: w.clock.nowMs(),
    });
  });

  it("a matching count is reviewed with no follow-up", async () => {
    const result = await run("k1", 300_000);
    expect(result.differenceMinor).toBe(0);
    expect(result.followUpId).toBeUndefined();
    expect((await reconciliations.get(alice, "recon-k1"))?.reviewStatus).toBe("reviewed");
    expect(await followUps.listOpen(alice)).toEqual([]);
  });

  it("counting zero is allowed", async () => {
    expect((await run("k1", 0)).differenceMinor).toBe(-300_000);
  });

  it("the same key twice stores one count and one follow-up", async () => {
    const first = await run("k1", 230_000);
    const second = await run("k1", 230_000);
    expect(second).toEqual({ ...first, status: "alreadyRecorded" });
    expect(await followUps.listOpen(alice)).toHaveLength(1);
  });

  it("a replayed key reports the stored count, even if the balances moved since", async () => {
    const first = await run("k1", 230_000);
    await account("cash-extra", "cash", 10_000);
    expect(await run("k1", 230_000)).toEqual({ ...first, status: "alreadyRecorded" });
  });

  it("a new count supersedes an older open one", async () => {
    await run("k1", 230_000);
    w.clock.advance(1_000);
    await run("k2", 250_000);
    expect((await reconciliations.get(alice, "recon-k1"))?.reviewStatus).toBe("dismissed");
    expect(await followUps.get(alice, "fu-recon-k1")).toMatchObject({
      state: "resolved",
      resolution: "superseded",
    });
    expect((await followUps.listOpen(alice)).map((f) => f.id)).toEqual(["fu-recon-k2"]);
  });

  it("a crash before older counts were closed is finished by the retry", async () => {
    await run("k1", 230_000);
    w.clock.advance(1_000);
    const flaky = new RecordCashCount({
      accounts: w.accounts,
      reader: w.ledger,
      reconciliations: {
        get: (o, id) => reconciliations.get(o, id),
        recordCount: (o, r, f) => reconciliations.recordCount(o, r, f),
        listOpenCashCounts: () => Promise.reject(new Error("crash")),
        markStatus: (o, id, st, t, n) => reconciliations.markStatus(o, id, st, t, n),
      },
      followUps,
      clock: w.clock,
    });
    await expect(flaky.execute({ ownerId: alice, idempotencyKey: "k2", countedMinor: 250_000, currency: "BDT" })).rejects.toThrow("crash");
    expect((await run("k2", 250_000)).status).toBe("alreadyRecorded");
    expect((await reconciliations.get(alice, "recon-k1"))?.reviewStatus).toBe("dismissed");
    expect((await followUps.listOpen(alice)).map((f) => f.id)).toEqual(["fu-recon-k2"]);
  });

  it("replaying an older count never closes a newer one", async () => {
    await run("k1", 230_000);
    w.clock.advance(1_000);
    await run("k2", 250_000);
    await run("k1", 230_000);
    expect((await reconciliations.get(alice, "recon-k2"))?.reviewStatus).toBe("open");
  });

  it("two counts made at the same moment do not close each other", async () => {
    await run("k1", 230_000);
    await run("k2", 250_000);
    expect((await followUps.listOpen(alice)).map((f) => f.id).sort()).toEqual(["fu-recon-k1", "fu-recon-k2"]);
  });

  it("a count over expected says more", async () => {
    await run("k1", 310_000);
    expect((await followUps.get(alice, "fu-recon-k1"))?.question).toBe(
      "Your cash count was ৳100 more than expected. What explains the difference?",
    );
  });

  it("a closed cash account is left out", async () => {
    await w.accounts.create(alice, {
      id: asAccountId("old"),
      kind: "cash",
      name: "old",
      currency: "BDT",
      status: "closed",
      createdAtMs: 1,
    });
    expect((await run("k1", 300_000)).differenceMinor).toBe(0);
  });
});
