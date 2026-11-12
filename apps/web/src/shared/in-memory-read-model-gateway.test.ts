import { describe, expect, it } from "vitest";
import { InMemoryReadModelGateway } from "./in-memory-read-model-gateway";
import type { AiUsageRow, LedgerEntryRow } from "./read-model-gateway";

const income = (id: string, occurredAtMs: number): LedgerEntryRow => ({
  id: `${id}:1`,
  transactionId: id,
  accountId: "income-salary",
  accountKind: "income",
  side: "credit",
  amountMinor: 100,
  currency: "BDT",
  occurredAtMs,
});

const usage = (id: string, createdAtMs: number): AiUsageRow => ({
  id,
  providerId: "deepseek",
  estimatedMicroUsd: 10,
  outcome: "success",
  userApprovedRetry: false,
  sourceEventId: "e1",
  stage: "interpret",
  attempt: 1,
  createdAtMs,
});

describe("InMemoryReadModelGateway", () => {
  it("delivers income and AI usage within the range, and pushes updates", () => {
    const gateway = new InMemoryReadModelGateway();
    gateway.setIncomeEntries([income("in", 500), income("out", 5_000)]);
    gateway.setAiUsage([usage("in", 500), usage("out", 5_000)]);
    const seen: { income: string[][]; usage: string[][] } = { income: [], usage: [] };
    gateway.watchIncomeEntries(100, 1_000, (rows) => { seen.income.push(rows.map((r) => r.transactionId)); });
    gateway.watchAiUsage(100, 1_000, (rows) => { seen.usage.push(rows.map((r) => r.id)); });
    expect(seen.income).toEqual([["in"]]);
    expect(seen.usage).toEqual([["in"]]);
    gateway.setIncomeEntries([income("in", 500), income("new", 900)]);
    expect(seen.income.at(-1)).toEqual(["in", "new"]);
  });
});
