import {
  Money,
  asAccountId,
  asIdempotencyKey,
  asOwnerId,
  asSourceEventId,
  asTransactionId,
  type RealAccountKind,
} from "@moneytrace/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { followUpRecord } from "../testing/follow-up-contract";
import { InMemoryFollowUps } from "../testing/in-memory-follow-ups";
import { createWorld } from "../testing/world";
import { CorrectTransaction } from "./correct-transaction";
import { PostTransaction } from "./post-transaction";
import { RecordCustodyTransfer } from "./record-custody-transfer";
import { ResolveFollowUp } from "./resolve-follow-up";
import { SnoozeFollowUp } from "./snooze-follow-up";
import { UpdateSettings } from "./update-settings";
import { WakeSnoozedFollowUps } from "./wake-snoozed-follow-ups";
import { SYSTEM_CASH_ACCOUNT_ID } from "./bootstrap-user";

const alice = asOwnerId("alice");
const bob = asOwnerId("bob");
const T = 1_700_000_000_000;
const code = (c: string): Error => expect.objectContaining({ code: c }) as Error;
const bdt = (n: number) => Money.ofMinor(n, "BDT");
const ref = (id: string, kind: RealAccountKind) => ({
  id: asAccountId(id),
  kind,
  currency: "BDT" as const,
});
const bank = ref("bank", "bank");
const system = ref(SYSTEM_CASH_ACCOUNT_ID, "cash");

let w: ReturnType<typeof createWorld>;
let followUps: InMemoryFollowUps;
let post: PostTransaction;
let resolve: ResolveFollowUp;

const balance = (id: string) => w.ledger.getBalance(alice, asAccountId(id));

beforeEach(async () => {
  w = createWorld();
  followUps = new InMemoryFollowUps();
  post = new PostTransaction({
    writer: w.ledger,
    accounts: w.accounts,
    hasher: w.hasher,
    clock: w.clock,
  });
  resolve = new ResolveFollowUp({
    followUps,
    reader: w.ledger,
    accounts: w.accounts,
    post,
    clock: w.clock,
  });
  const seed: [string, RealAccountKind, string][] = [
    ["bank", "bank", "Bank"],
    [SYSTEM_CASH_ACCOUNT_ID, "cash", "Cash · place not set"],
    ["wallet", "cash", "My wallet"],
    ["ammu", "familyCash", "Ammu"],
    ["card", "creditLiability", "Card"],
  ];
  for (const [id, kind, name] of seed) {
    await w.accounts.ensure(alice, {
      id: asAccountId(id),
      kind,
      name,
      currency: "BDT",
      status: "active",
      createdAtMs: 1,
    });
  }
  await post.execute({
    ownerId: alice,
    idempotencyKey: asIdempotencyKey("w1"),
    transactionId: asTransactionId("t1"),
    intent: { type: "withdrawal", bank, cash: system, amount: bdt(400_000) },
    occurredAtMs: T,
    sourceEventIds: [asSourceEventId("e1")],
    actor: "pipeline",
  });
  followUps.seed(alice, followUpRecord());
});

const answer = (accountId: string, owner = alice) =>
  resolve.execute({
    ownerId: owner,
    followUpId: "f1",
    resolution: { kind: "destination", accountId },
  });

describe("ResolveFollowUp", () => {
  it("answering My wallet moves the cash there, with no expense", async () => {
    expect(await answer("wallet")).toEqual({ state: "resolved" });
    expect(await balance("wallet")).toBe(400_000);
    expect(await balance(SYSTEM_CASH_ACCOUNT_ID)).toBe(0);
    const entries = await w.ledger.getEntries(alice, asTransactionId("txn-followup-f1"));
    expect(entries.some((e) => e.accountKind === "expense")).toBe(false);
    expect((await followUps.get(alice, "f1"))?.state).toBe("resolved");
  });

  it("answering never moves more than the not-yet-explained cash still holds", async () => {
    await post.execute({
      ownerId: alice,
      idempotencyKey: asIdempotencyKey("counted"),
      transactionId: asTransactionId("t-count"),
      intent: { type: "adjustment", account: system, direction: "decrease", amount: bdt(300_000), cause: "count", authorizedBy: "alice" },
      occurredAtMs: T + 1,
      sourceEventIds: [],
      actor: "alice",
    });
    expect(await answer("wallet")).toEqual({ state: "resolved" });
    expect(await balance("wallet")).toBe(100_000);
    expect(await balance(SYSTEM_CASH_ACCOUNT_ID)).toBe(0);
  });

  it("answering when that cash was all counted away moves nothing and still closes", async () => {
    await post.execute({
      ownerId: alice,
      idempotencyKey: asIdempotencyKey("counted"),
      transactionId: asTransactionId("t-count"),
      intent: { type: "adjustment", account: system, direction: "decrease", amount: bdt(400_000), cause: "count", authorizedBy: "alice" },
      occurredAtMs: T + 1,
      sourceEventIds: [],
      actor: "alice",
    });
    expect(await answer("wallet")).toEqual({ state: "resolved" });
    expect(await balance("wallet")).toBe(0);
    expect(await balance(SYSTEM_CASH_ACCOUNT_ID)).toBe(0);
    expect(await w.ledger.getTransaction(alice, asTransactionId("txn-followup-f1"))).toBeNull();
  });

  it("answering Gave to Ammu is custody: the name stays in the audit, no expense", async () => {
    await answer("ammu");
    expect(await balance("ammu")).toBe(400_000);
    expect(await w.ledger.getTransaction(alice, asTransactionId("txn-followup-f1"))).toMatchObject({
      intentType: "cashCustodyTransfer",
      auditDetails: { holderName: "Ammu" },
    });
  });

  it("a double-tap posts once", async () => {
    await answer("wallet");
    expect(await answer("wallet")).toEqual({ state: "resolved" });
    expect(await balance("wallet")).toBe(400_000);
  });

  it("concurrent double-taps post once", async () => {
    await Promise.all([answer("wallet"), answer("wallet")]);
    expect(await balance("wallet")).toBe(400_000);
  });

  it("a second answer to another wallet does not move the cash again", async () => {
    await answer("wallet");
    await answer("ammu");
    expect(await balance("wallet")).toBe(400_000);
    expect(await balance("ammu")).toBe(0);
  });

  it("not sure yet keeps it open, moves nothing, and waits for the next digest", async () => {
    w.clock.advance(Date.parse("2026-04-01T06:00:00Z") - w.clock.nowMs());
    expect(
      await resolve.execute({
        ownerId: alice,
        followUpId: "f1",
        resolution: { kind: "notSureYet" },
      }),
    ).toEqual({ state: "open" });
    expect(await followUps.get(alice, "f1")).toMatchObject({
      state: "open",
      dueAtMs: Date.parse("2026-04-01T14:00:00Z"),
    });
    expect(await balance(SYSTEM_CASH_ACCOUNT_ID)).toBe(400_000);
  });

  it.each(["bank", "card", SYSTEM_CASH_ACCOUNT_ID, "missing"])(
    "refuses %s as a destination",
    async (id) => {
      await expect(answer(id)).rejects.toThrow(
        expect.objectContaining({
          code: expect.stringMatching(/invalidIntent|accountInvalid/) as string,
        }) as Error,
      );
      expect(await balance(SYSTEM_CASH_ACCOUNT_ID)).toBe(400_000);
      expect((await followUps.get(alice, "f1"))?.state).toBe("open");
    },
  );

  it("another owner's follow-up is not found", async () => {
    await expect(answer("wallet", bob)).rejects.toThrow(code("resourceNotFound"));
  });

  it("another owner's account as a destination is refused", async () => {
    await w.accounts.ensure(bob, {
      id: asAccountId("bobs"),
      kind: "cash",
      name: "b",
      currency: "BDT",
      status: "active",
      createdAtMs: 1,
    });
    await expect(answer("bobs")).rejects.toThrow(code("accountInvalid"));
  });
});

describe("snooze and wake", () => {
  const snooze = () => new SnoozeFollowUp({ followUps, clock: w.clock });
  const wake = () =>
    new WakeSnoozedFollowUps({
      followUps,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });

  it("gate 31: snoozed is hidden until the time, then wakes once", async () => {
    const until = w.clock.nowMs() + 1000;
    await snooze().execute({ ownerId: alice, followUpId: "f1", untilMs: until });
    expect((await followUps.listOpen(alice)).map((f) => f.id)).toEqual([]);
    expect(await wake().execute(until - 1, 10)).toEqual({ woken: 0 });
    expect(await wake().execute(until, 10)).toEqual({ woken: 1 });
    expect((await followUps.listOpen(alice)).map((f) => f.id)).toEqual(["f1"]);
    expect(await wake().execute(until, 10)).toEqual({ woken: 0 });
  });

  it("gate 31: a resolved follow-up never returns", async () => {
    await answer("wallet");
    expect((await followUps.listOpen(alice)).map((f) => f.id)).toEqual([]);
    expect(await wake().execute(T * 2, 10)).toEqual({ woken: 0 });
  });

  it("refuses a snooze into the past", async () => {
    await expect(
      snooze().execute({ ownerId: alice, followUpId: "f1", untilMs: 1 }),
    ).rejects.toThrow(code("invalidIntent"));
  });

  it("another owner's follow-up is not found", async () => {
    await expect(
      snooze().execute({ ownerId: bob, followUpId: "f1", untilMs: T * 2 }),
    ).rejects.toThrow(code("resourceNotFound"));
  });

  it("the question and every state keep neutral wording", () => {
    expect(followUpRecord().question).not.toMatch(/spent|lost|missing/i);
  });
});

describe("RecordCustodyTransfer", () => {
  const custody = () => new RecordCustodyTransfer({ accounts: w.accounts, post });
  const request = (over = {}) => ({
    ownerId: alice,
    idempotencyKey: "c1",
    fromAccountId: SYSTEM_CASH_ACCOUNT_ID,
    toAccountId: "ammu",
    amountMinor: 1000,
    currency: "BDT" as const,
    holderName: "Ammu",
    occurredAtMs: T,
    ...over,
  });

  it("moves custody with no expense and keeps the name", async () => {
    expect(await custody().execute(request())).toMatchObject({ status: "recorded" });
    expect(await balance("ammu")).toBe(1000);
  });

  it("a repeat is already recorded", async () => {
    await custody().execute(request());
    expect(await custody().execute(request())).toMatchObject({ status: "alreadyRecorded" });
    expect(await balance("ammu")).toBe(1000);
  });

  it("refuses a bank as an end, and another owner's account", async () => {
    await expect(custody().execute(request({ toAccountId: "bank" }))).rejects.toThrow(
      code("invalidIntent"),
    );
    await expect(custody().execute(request({ toAccountId: "nope" }))).rejects.toThrow(
      code("accountInvalid"),
    );
  });
});

describe("CorrectTransaction", () => {
  const correct = () =>
    new CorrectTransaction({
      reader: w.ledger,
      writer: w.ledger,
      accounts: w.accounts,
      hasher: w.hasher,
      clock: w.clock,
    });

  it("gate 33: reverses and replaces with a new amount, keeping evidence and audit", async () => {
    const r = await correct().execute({
      ownerId: alice,
      idempotencyKey: "fix1",
      transactionId: "t1",
      replacement: { amountMinor: 300_000, currency: "BDT" },
      rationale: "wrong amount",
    });
    expect(r.status).toBe("recorded");
    expect(await balance("bank")).toBe(-300_000);
    expect(await balance(SYSTEM_CASH_ACCOUNT_ID)).toBe(300_000);
    expect(await w.ledger.getTransaction(alice, asTransactionId("t1"))).toMatchObject({
      state: "reversed",
      sourceEventIds: ["e1"],
    });
    expect((await w.ledger.getEntries(alice, asTransactionId("t1"))).length).toBe(2);
    expect(
      await w.ledger.getTransaction(alice, asTransactionId(r.reversalTransactionId)),
    ).toMatchObject({
      rationale: "wrong amount",
      actor: "alice",
    });
    expect(r.replacementTransactionId).toBeDefined();
  });

  it("answering the follow-up after a correction moves the corrected amount", async () => {
    await correct().execute({
      ownerId: alice,
      idempotencyKey: "fix-a",
      transactionId: "t1",
      replacement: { amountMinor: 300_000, currency: "BDT" },
      rationale: "wrong amount",
    });
    expect(await answer("wallet")).toEqual({ state: "resolved" });
    expect(await balance("wallet")).toBe(300_000);
    expect(await balance(SYSTEM_CASH_ACCOUNT_ID)).toBe(0);
  });

  it("answering the follow-up after a reversal moves nothing", async () => {
    await correct().execute({ ownerId: alice, idempotencyKey: "fix-b", transactionId: "t1", rationale: "not mine" });
    await expect(answer("wallet")).rejects.toThrow(code("invalidIntent"));
    expect(await balance("wallet")).toBe(0);
    expect(await balance(SYSTEM_CASH_ACCOUNT_ID)).toBe(0);
  });

  it("gate 33: with no replacement it only reverses", async () => {
    const r = await correct().execute({
      ownerId: alice,
      idempotencyKey: "fix2",
      transactionId: "t1",
      rationale: "not mine",
    });
    expect(await balance("bank")).toBe(0);
    expect(r.replacementTransactionId).toBeUndefined();
  });

  it("a replay is already recorded and moves nothing", async () => {
    const input = { ownerId: alice, idempotencyKey: "fix3", transactionId: "t1", rationale: "x" };
    await correct().execute(input);
    expect((await correct().execute(input)).status).toBe("alreadyRecorded");
    expect(await balance("bank")).toBe(0);
  });

  it("a second correction of the same transaction is refused", async () => {
    await correct().execute({
      ownerId: alice,
      idempotencyKey: "a",
      transactionId: "t1",
      rationale: "x",
    });
    await expect(
      correct().execute({
        ownerId: alice,
        idempotencyKey: "b",
        transactionId: "t1",
        rationale: "y",
      }),
    ).rejects.toThrow(code("invalidTransition"));
  });

  it("another owner's transaction is not found", async () => {
    await expect(
      correct().execute({ ownerId: bob, idempotencyKey: "z", transactionId: "t1", rationale: "x" }),
    ).rejects.toThrow(code("resourceNotFound"));
  });

  it("a card purchase keeps its category in the replacement", async () => {
    await post.execute({
      ownerId: alice,
      idempotencyKey: asIdempotencyKey("c"),
      transactionId: asTransactionId("t2"),
      intent: {
        type: "cardPurchase",
        card: ref("card", "creditLiability"),
        category: "groceries",
        amount: bdt(500),
      },
      occurredAtMs: T,
      sourceEventIds: [],
      actor: "pipeline",
    });
    await correct().execute({
      ownerId: alice,
      idempotencyKey: "fix4",
      transactionId: "t2",
      replacement: { amountMinor: 700, currency: "BDT" },
      rationale: "x",
    });
    expect(await balance("card")).toBe(-700);
    expect(await balance("nominal:expense:groceries:BDT")).toBe(700);
  });
});

describe("UpdateSettings", () => {
  it("applies reminder time and timezone", async () => {
    const saved: unknown[] = [];
    const uc = new UpdateSettings({
      profiles: {
        update: (_o, patch) => {
          saved.push(patch);
          return Promise.resolve();
        },
      },
    });
    await uc.execute({
      ownerId: alice,
      timezone: "Asia/Dhaka",
      reminders: { digestLocalTime: "21:00", frequency: "daily", minThresholdMinor: 0 },
    });
    expect(saved).toEqual([
      {
        timezone: "Asia/Dhaka",
        notifications: { digestLocalTime: "21:00", frequency: "daily", minThresholdMinor: 0 },
      },
    ]);
  });

  it("refuses an unknown timezone, and settings not yet supported", async () => {
    const uc = new UpdateSettings({ profiles: { update: () => Promise.resolve() } });
    await expect(uc.execute({ ownerId: alice, timezone: "Mars/Olympus" })).rejects.toThrow(
      code("invalidIntent"),
    );
    await expect(
      uc.execute({ ownerId: alice, reportingCycle: { kind: "calendarMonth" } }),
    ).rejects.toThrow(code("invalidIntent"));
  });
});
