import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FIXTURE_ACCOUNTS,
  FIXTURE_EXPENSE_ENTRIES,
  FIXTURE_INCOME_ENTRIES,
  FIXTURE_SOURCE_ENTRIES,
  FIXTURE_SOURCE_EVENTS,
} from "./fixtures/household";
import { applyQuery, createDocsReadModelGateway, type DocsQuery, type DocsSource } from "./supabase-read-model-gateway";

/** A source that ignores every filter, so the gateway's own filtering is what's tested. */
function memorySource(collections: Record<string, unknown[]>, uid: string | null = "alice") {
  const listeners = new Set<() => void>();
  const asked: DocsQuery[] = [];
  const source: DocsSource = {
    uid: () => uid,
    list: (_owner, q) => {
      asked.push(q);
      return Promise.resolve([...(collections[q.collection] ?? [])]);
    },
    onChange: (_owner, cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return { source, asked, change: () => { listeners.forEach((cb) => { cb(); }); }, listeners };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const flush = () => vi.advanceTimersByTimeAsync(0);

describe("Supabase read models", () => {
  it("delivers parsed rows, then fresh rows after a change settles", async () => {
    const data = { accounts: [...FIXTURE_ACCOUNTS] };
    const m = memorySource(data);
    const seen: number[] = [];
    const stop = createDocsReadModelGateway(m.source).watchAccounts((rows) => seen.push(rows.length));
    await flush();
    expect(seen).toEqual([FIXTURE_ACCOUNTS.length]);
    data.accounts.pop();
    m.change();
    m.change();
    await vi.advanceTimersByTimeAsync(300);
    expect(seen).toEqual([FIXTURE_ACCOUNTS.length, FIXTURE_ACCOUNTS.length - 1]);
    stop();
    expect(m.listeners.size).toBe(0);
  });

  it("source events: newest first, limited", async () => {
    const m = memorySource({ sourceEvents: [...FIXTURE_SOURCE_EVENTS].reverse() });
    let got: { receivedAtMs: number }[] = [];
    createDocsReadModelGateway(m.source).watchSourceEvents(3, (rows) => (got = rows));
    await flush();
    const newest = [...FIXTURE_SOURCE_EVENTS].sort((a, b) => b.receivedAtMs - a.receivedAtMs).slice(0, 3);
    expect(got.map((r) => r.receivedAtMs)).toEqual(newest.map((r) => r.receivedAtMs));
  });

  it("expense and income entries: one kind, inside the range, oldest first", async () => {
    const all = [...FIXTURE_EXPENSE_ENTRIES, ...FIXTURE_INCOME_ENTRIES];
    const m = memorySource({ ledgerEntries: all });
    const times = all.map((e) => e.occurredAtMs).sort((a, b) => a - b);
    const from = times[1] ?? 0;
    const to = times.at(-2) ?? 0;
    let expenses: { accountKind: string; occurredAtMs: number }[] = [];
    let income: { accountKind: string }[] = [];
    const gw = createDocsReadModelGateway(m.source);
    gw.watchExpenseEntries(from, to, (rows) => (expenses = rows));
    gw.watchIncomeEntries(0, Number.MAX_SAFE_INTEGER, (rows) => (income = rows));
    await flush();
    expect(expenses.length).toBeGreaterThan(0);
    expect(expenses.every((e) => e.accountKind === "expense" && e.occurredAtMs >= from && e.occurredAtMs <= to)).toBe(true);
    expect(expenses.map((e) => e.occurredAtMs)).toEqual([...expenses.map((e) => e.occurredAtMs)].sort((a, b) => a - b));
    expect(income).toHaveLength(FIXTURE_INCOME_ENTRIES.length);
  });

  it("source entries are the bank, cash, family cash and card legs only", async () => {
    const m = memorySource({ ledgerEntries: [...FIXTURE_SOURCE_ENTRIES, ...FIXTURE_EXPENSE_ENTRIES] });
    let rows: { accountKind: string }[] = [];
    createDocsReadModelGateway(m.source).watchSourceEntries(0, Number.MAX_SAFE_INTEGER, (r) => (rows = r));
    await flush();
    expect(rows.length).toBe(FIXTURE_SOURCE_ENTRIES.length);
    expect(new Set(rows.map((r) => r.accountKind))).not.toContain("expense");
  });

  it("a malformed document or failed read is reported, and nothing is read signed out", async () => {
    const bad = memorySource({ accounts: [{ id: "x" }] });
    const errors: string[] = [];
    createDocsReadModelGateway(bad.source).watchAccounts(() => undefined, (e) => errors.push(e.name));
    await flush();
    expect(errors).toHaveLength(1);
    const out = memorySource({}, null);
    const outErrors: string[] = [];
    createDocsReadModelGateway(out.source).watchAccounts(() => undefined, (e) => outErrors.push(e.message));
    expect(outErrors).toEqual(["a signed-in user is required"]);
    expect(out.asked).toHaveLength(0);
  });

  it("polls every 30 seconds in case a change notice is missed", async () => {
    const m = memorySource({ accounts: [] });
    createDocsReadModelGateway(m.source).watchAccounts(() => undefined);
    await flush();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(m.asked).toHaveLength(2);
  });
});

describe("applyQuery", () => {
  it("excludes rows whose range field is missing or not a number", () => {
    expect(applyQuery([{ t: 5 }, { t: "5" }, {}], { collection: "c", range: { field: "t", fromMs: 0, toMs: 10 } })).toEqual([{ t: 5 }]);
  });
});
