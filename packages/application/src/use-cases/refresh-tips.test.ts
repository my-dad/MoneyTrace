import { Money, asAccountId, asIdempotencyKey, asOwnerId, asTransactionId, type PostingIntent } from "@moneytrace/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIGateway, DEFAULT_AI_ESTIMATE_MICRO_USD } from "../pipeline/ai-gateway";
import { CapturingLogger, FakeClock, TestHasher } from "../testing/fakes";
import { createProviderWorld } from "../testing/fake-provider";
import { InMemoryAccountRepository, InMemoryLedger } from "../testing/in-memory-ledger";
import { InMemoryTips } from "../testing/in-memory-tips";
import { ScriptedAiProvider } from "../testing/scripted-ai-provider";
import { PostTransaction } from "./post-transaction";
import { RefreshTips } from "./refresh-tips";

const alice = asOwnerId("alice");
const DAY_MS = 86_400_000;
/** A wall-clock time in Dhaka (UTC+6) as an instant. */
const dhaka = (y: number, m: number, d: number, h = 12): number => Date.UTC(y, m - 1, d, h - 6);
const NOW = dhaka(2026, 11, 6);
const bank = { id: asAccountId("bank"), kind: "bank" as const, currency: "BDT" as const };
const pocket = { id: asAccountId("cash-unassigned"), kind: "cash" as const, currency: "BDT" as const };

let ledger: InMemoryLedger;
let accounts: InMemoryAccountRepository;
let clock: FakeClock;
let tips: InMemoryTips;
let provider: ScriptedAiProvider;
let logger: CapturingLogger;
let n = 0;

async function post(intent: PostingIntent, atMs: number): Promise<void> {
  n += 1;
  const id = `tx-${String(n)}`;
  await new PostTransaction({ writer: ledger, accounts, hasher: new TestHasher(), clock }).execute({
    ownerId: alice,
    idempotencyKey: asIdempotencyKey(`k-${id}`),
    transactionId: asTransactionId(id),
    intent,
    occurredAtMs: atMs,
    sourceEventIds: [],
    actor: "pipeline",
  });
}
const spend = (category: string, minor: number, atMs: number) => post({ type: "purchase", funding: bank, category, amount: Money.ofMinor(minor, "BDT") }, atMs);

/** Food up on October, ৳2,500 not sorted, Food the top sector: three facts. */
async function seedMonth(): Promise<void> {
  await spend("food", 213000, dhaka(2026, 10, 3));
  await spend("food", 294000, dhaka(2026, 11, 3));
  await spend("uncategorized", 250000, dhaka(2026, 11, 4));
  for (const day of [1, 2, 4, 5]) await spend("other", 100, dhaka(2026, 11, day));
}
const IDS = ["sectorUp:food", "unsorted", "topSector:food"];
const adviseAll = (times = 1) => {
  for (let i = 0; i < times; i++) provider.scriptTips({ kind: "success", value: { tips: IDS.map((factId) => ({ factId, advice: `Gentle advice ${"x".repeat(i)}.` })) } });
};

function refresher(limits?: { perRequestMicroUsd: number; dailyMicroUsd: number; monthlyMicroUsd: number }) {
  const world = createProviderWorld();
  const gateway = new AIGateway(world.executor(limits === undefined ? {} : { limits }), provider, DEFAULT_AI_ESTIMATE_MICRO_USD);
  return new RefreshTips({ reader: ledger, tips, writer: gateway, hasher: new TestHasher(), clock, logger });
}
const run = (r: RefreshTips, force = false) => r.execute({ ownerId: alice, force });

beforeEach(async () => {
  ledger = new InMemoryLedger();
  accounts = new InMemoryAccountRepository();
  clock = new FakeClock(NOW);
  tips = new InMemoryTips();
  provider = new ScriptedAiProvider();
  logger = new CapturingLogger();
  await accounts.ensure(alice, { id: bank.id, kind: "bank", name: "Bank", currency: "BDT", status: "active", createdAtMs: 1 });
  await accounts.ensure(alice, { id: pocket.id, kind: "cash", name: "Cash", currency: "BDT", status: "active", createdAtMs: 1 });
});

describe("RefreshTips", () => {
  it("the first open saves the facts and the advice, with model and prompt version", async () => {
    await seedMonth();
    adviseAll();
    expect(await run(refresher())).toEqual({ outcome: "made" });
    const doc = await tips.get(alice);
    expect(doc?.facts.map((f) => f.id)).toEqual(IDS);
    expect(Object.keys(doc?.advice ?? {}).sort()).toEqual([...IDS].sort());
    expect(doc).toMatchObject({ status: "ready", month: "2026-11", model: "scripted-model", promptVersion: "scripted-tips-v1", adviceAtMs: NOW, aiDay: "2026-11-06" });
    expect(provider.lastTipsInput).toEqual({
      facts: (doc?.facts ?? []).map((f) => ({ id: f.id, kind: f.kind, ...(f.sector === undefined ? {} : { sectorLabel: f.sector === "food" ? "Food" : f.sector }), headline: f.headline, detail: f.detail })),
      dayOfMonth: 6,
      daysInMonth: 30,
    });
  });

  it("opening again the same day makes no AI call", async () => {
    await seedMonth();
    adviseAll(2);
    const r = refresher();
    await run(r);
    expect(await run(r)).toEqual({ outcome: "unchanged" });
    expect(provider.tipsCalls).toBe(1);
  });

  it("the next day: no call while the figures are the same, a call once they change", async () => {
    await seedMonth();
    adviseAll(2);
    const r = refresher();
    await run(r);
    clock.advance(DAY_MS);
    expect(await run(r)).toEqual({ outcome: "unchanged" });
    await spend("food", 50000, dhaka(2026, 11, 7, 9));
    expect(await run(r)).toEqual({ outcome: "made" });
    expect(provider.tipsCalls).toBe(2);
  });

  it("New tips: three a day, every attempt counted; the automatic call takes no slot", async () => {
    await seedMonth();
    adviseAll(5);
    const r = refresher();
    expect(await run(r)).toEqual({ outcome: "made" });
    const forced = [await run(r, true), await run(r, true), await run(r, true), await run(r, true)];
    expect(forced.map((f) => f.outcome)).toEqual(["made", "made", "made", "limitReached"]);
    expect(provider.tipsCalls).toBe(4);
  });

  it("not enough spending yet: no AI call", async () => {
    for (const day of [1, 2, 3, 4]) await spend("food", 1000, dhaka(2026, 11, day));
    await spend("food", 1000, dhaka(2026, 10, 1));
    expect(await run(refresher(), true)).toEqual({ outcome: "notEnoughData" });
    expect(provider.tipsCalls).toBe(0);
    expect(await tips.get(alice)).toMatchObject({ status: "notEnoughData", waitingFor: "moreSpends", facts: [], factsHash: null });
  });

  it("the AI budget used up: the figures still show, and a later open may try again", async () => {
    await seedMonth();
    expect(await run(refresher({ perRequestMicroUsd: 1, dailyMicroUsd: 1, monthlyMicroUsd: 1 }))).toEqual({ outcome: "factsOnly" });
    expect(await tips.get(alice)).toMatchObject({ status: "factsOnly", aiDay: null, advice: {} });
    expect((await tips.get(alice))?.facts).toHaveLength(3);
  });

  it("the provider failing: the figures still show", async () => {
    await seedMonth();
    provider.scriptTips({ kind: "definiteFailure", code: "http429" });
    expect(await run(refresher())).toEqual({ outcome: "factsOnly" });
    expect(await tips.get(alice)).toMatchObject({ status: "factsOnly", aiDay: "2026-11-06" });
  });

  it("an AI call that throws (no key configured): the figures still show, and a later open may try again", async () => {
    await seedMonth();
    const writer = {
      tipsIdentity: { model: "m", promptVersion: "v" },
      writeTips: () => Promise.reject(new Error("DEEPSEEK_API_KEY is not configured")),
    };
    const r = new RefreshTips({ reader: ledger, tips, writer, hasher: new TestHasher(), clock, logger });
    expect(await r.execute({ ownerId: alice, force: false })).toEqual({ outcome: "factsOnly" });
    expect(await tips.get(alice)).toMatchObject({ status: "factsOnly", aiDay: null });
    expect((await tips.get(alice))?.facts).toHaveLength(3);
    expect(logger.events.find((e) => e.event === "tips.adviceFailed")?.fields).toEqual({ errorName: "Error" });
  });

  it("advice that all fails the checks: the figures still show", async () => {
    await seedMonth();
    provider.scriptTips({ kind: "success", value: { tips: IDS.map((factId) => ({ factId, advice: "Save 500 a week." })) } });
    expect(await run(refresher())).toEqual({ outcome: "factsOnly" });
    expect(await tips.get(alice)).toMatchObject({ status: "factsOnly", advice: {} });
  });

  it("advice stays while its fact is still chosen, and goes when the fact does", async () => {
    await seedMonth();
    adviseAll();
    const r = refresher();
    await run(r);
    await spend("other", 100, dhaka(2026, 11, 6, 9));
    await run(r);
    let doc = await tips.get(alice);
    expect(doc?.facts.find((f) => f.id === "topSector:food")?.compareMinor).toBe(544500);
    expect(Object.keys(doc?.advice ?? {}).sort()).toEqual([...IDS].sort());
    await spend("groceries", 900000, dhaka(2026, 11, 6, 10));
    await run(r);
    doc = await tips.get(alice);
    expect(doc?.facts.map((f) => f.id)).toEqual(["sectorUp:food", "unsorted", "topSector:groceries"]);
    expect(Object.keys(doc?.advice ?? {}).sort()).toEqual(["sectorUp:food", "unsorted"]);
    expect(doc?.status).toBe("ready");
  });

  it("two tabs opening at once make one AI call; the second waits for it instead of failing", async () => {
    await seedMonth();
    adviseAll();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const world = createProviderWorld();
    const gateway = new AIGateway(world.executor(), provider, DEFAULT_AI_ESTIMATE_MICRO_USD);
    const slowProvider = {
      tipsIdentity: gateway.tipsIdentity,
      writeTips: async (...args: Parameters<AIGateway["writeTips"]>) => {
        const out = gateway.writeTips(...args);
        await held;
        return out;
      },
    };
    const tab = () => new RefreshTips({ reader: ledger, tips, writer: slowProvider, hasher: new TestHasher(), clock, logger });
    const first = tab().execute({ ownerId: alice, force: false });
    await vi.waitFor(() => { expect(provider.tipsCalls).toBe(1); });
    expect(await tab().execute({ ownerId: alice, force: false })).toEqual({ outcome: "unchanged" });
    release();
    expect(await first).toEqual({ outcome: "made" });
    expect(provider.tipsCalls).toBe(1);
    expect(await tips.get(alice)).toMatchObject({ status: "ready" });
  });

  it("a claim left by a call that never finished expires", async () => {
    await seedMonth();
    adviseAll();
    const stuck = { tipsIdentity: { model: "m", promptVersion: "v" }, writeTips: () => new Promise<never>(() => undefined) };
    void new RefreshTips({ reader: ledger, tips, writer: stuck, hasher: new TestHasher(), clock, logger }).execute({ ownerId: alice, force: false });
    await vi.waitFor(async () => { expect((await tips.get(alice))?.aiCallUntilMs).toBeGreaterThan(NOW); });
    clock.advance(3 * 60_000);
    expect(await run(refresher())).toEqual({ outcome: "made" });
  });

  it("a refresh that finishes while another waits on the AI is never overwritten with older figures", async () => {
    await seedMonth();
    adviseAll(2);
    const world = createProviderWorld();
    const gateway = new AIGateway(world.executor(), provider, DEFAULT_AI_ESTIMATE_MICRO_USD);
    const other = new RefreshTips({ reader: ledger, tips, writer: gateway, hasher: new TestHasher(), clock, logger });
    let interleaved = false;
    const slow = {
      tipsIdentity: gateway.tipsIdentity,
      writeTips: async (...args: Parameters<AIGateway["writeTips"]>) => {
        if (!interleaved) {
          interleaved = true;
          // While this New tips waits on DeepSeek, an SMS posts and another tab refreshes.
          await spend("food", 100000, dhaka(2026, 11, 6, 9));
          await other.execute({ ownerId: alice, force: false });
        }
        return gateway.writeTips(...args);
      },
    };
    const first = new RefreshTips({ reader: ledger, tips, writer: slow, hasher: new TestHasher(), clock, logger });
    await first.execute({ ownerId: alice, force: true });
    const doc = await tips.get(alice);
    expect(doc?.facts.find((f) => f.id === "sectorUp:food")?.amountMinor).toBe(394000);
    expect(Object.keys(doc?.advice ?? {}).sort()).toEqual([...IDS].sort());
    expect(doc?.status).toBe("ready");
  });

  it("a cash withdrawal is never spending; it shows as unexplained cash", async () => {
    await seedMonth();
    await post({ type: "withdrawal", bank, cash: pocket, amount: Money.ofMinor(500000, "BDT") }, dhaka(2026, 11, 5));
    await run(refresher());
    const doc = await tips.get(alice);
    expect(doc?.facts.map((f) => f.id)).toEqual(["sectorUp:food", "unsorted", "unexplainedCash"]);
    expect(doc?.facts.find((f) => f.id === "unexplainedCash")?.amountMinor).toBe(500000);
  });

  it("logs the outcome only: no figures, words or advice", async () => {
    await seedMonth();
    adviseAll();
    await run(refresher());
    const logged = logger.events.find((e) => e.event === "tips.refreshed");
    expect(logged?.fields).toEqual({ outcome: "made", factCount: 3 });
    const all = JSON.stringify(logger.events);
    expect(all).not.toMatch(/headline|detail|advice|amountMinor|৳/);
  });
});
