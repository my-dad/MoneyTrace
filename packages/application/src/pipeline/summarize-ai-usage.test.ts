import { describe, expect, it } from "vitest";
import type { AIUsageRecord } from "../ports/ai-usage-recorder";
import { summarizeAiUsage } from "./summarize-ai-usage";

const rec = (over: Partial<AIUsageRecord> = {}): AIUsageRecord => ({
  id: "u",
  providerId: "deepseek",
  estimatedMicroUsd: 100,
  outcome: "success",
  userApprovedRetry: false,
  sourceEventId: "evt-1",
  stage: "interpret",
  attempt: 1,
  createdAtMs: 1,
  ...over,
});

describe("summarizeAiUsage", () => {
  it("counts requests, timeouts and manual retries, and prefers actual cost", () => {
    const out = summarizeAiUsage([
      rec({ estimatedMicroUsd: 100, actualMicroUsd: 60 }),
      rec({ estimatedMicroUsd: 200, outcome: "unknown", errorCode: "timeout" }),
      rec({ estimatedMicroUsd: 50, outcome: "unknown", errorCode: "providerError" }),
      rec({ estimatedMicroUsd: 10, userApprovedRetry: true, actualMicroUsd: 0 }),
    ]);
    expect(out).toEqual({
      requestCount: 4,
      costMicroUsd: 60 + 200 + 50 + 0,
      timeoutCount: 1,
      timeoutRateBp: 2500,
      manualRetryCount: 1,
    });
  });

  it("gives all zeros for an empty list without dividing by zero", () => {
    expect(summarizeAiUsage([])).toEqual({
      requestCount: 0,
      costMicroUsd: 0,
      timeoutCount: 0,
      timeoutRateBp: 0,
      manualRetryCount: 0,
    });
  });

  it("rounds the timeout rate down to whole basis points with integer arithmetic", () => {
    const records = [rec({ errorCode: "timeout" }), rec(), rec()];
    expect(summarizeAiUsage(records).timeoutRateBp).toBe(3333);
  });
});
