import type { OwnerId, PipelineStage } from "@moneytrace/domain";

/** Mirrors the `aiUsage` document schema. */
export type AIUsageRecord = {
  id: string;
  providerId: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedMicroUsd: number;
  actualMicroUsd?: number;
  outcome: "success" | "definiteFailure" | "unknown";
  errorCode?: string;
  userApprovedRetry: boolean;
  sourceEventId: string;
  stage: PipelineStage;
  attempt: number;
  createdAtMs: number;
};

export type AIUsageRecorder = {
  /**
   * Creates the row only if its ID is free. For placeholders (a died worker's attempt), which
   * must never replace a real row; a later `append` of the real row still replaces one.
   */
  appendIfAbsent(ownerId: OwnerId, record: AIUsageRecord): Promise<"created" | "exists">;
  /** Idempotent by record ID: appending an attempt twice keeps one record. */
  append(ownerId: OwnerId, record: AIUsageRecord): Promise<void>;
  /** `day` is `YYYY-MM-DD`, UTC; the day is half open. */
  listForUtcDay(ownerId: OwnerId, day: string): Promise<AIUsageRecord[]>;
};
