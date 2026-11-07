import type { AIUsageRecord } from "../ports/ai-usage-recorder";

export type AiUsageSummary = {
  requestCount: number;
  costMicroUsd: number;
  timeoutCount: number;
  /** Timeouts per 10,000 requests, rounded down. */
  timeoutRateBp: number;
  manualRetryCount: number;
};

/** Cost uses the provider-reported amount when present, otherwise the estimate. */
export function summarizeAiUsage(records: readonly AIUsageRecord[]): AiUsageSummary {
  let costMicroUsd = 0;
  let timeoutCount = 0;
  let manualRetryCount = 0;
  for (const r of records) {
    costMicroUsd += r.actualMicroUsd ?? r.estimatedMicroUsd;
    if (r.errorCode === "timeout") timeoutCount += 1;
    if (r.userApprovedRetry) manualRetryCount += 1;
  }
  const requestCount = records.length;
  const timeoutRateBp = requestCount === 0 ? 0 : Math.floor((timeoutCount * 10_000) / requestCount);
  return { requestCount, costMicroUsd, timeoutCount, timeoutRateBp, manualRetryCount };
}
