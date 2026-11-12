export type SourceEventStatus =
  | "received"
  | "normalized"
  | "interpreted"
  | "matched"
  | "decided"
  | "posted"
  | "linkedAsDuplicate"
  | "rejected"
  | "cancelled"
  | "pending"
  | "deadLetter";

export type PipelineStage = "normalize" | "interpret" | "match" | "decide" | "post";

export type PendingReason = "awaitingClarification" | "aiQuotaExhausted" | "providerOutcomeUnknown" | "aiQuestion";

export type DeadLetterReason =
  "attemptsExhausted" | "providerResultMissing" | "stageFailed" | "beforeOpeningBalance";

export const STAGE_INPUT_STATUS: Record<PipelineStage, SourceEventStatus> = {
  normalize: "received",
  interpret: "normalized",
  match: "interpreted",
  decide: "matched",
  post: "decided",
};

const TERMINAL: ReadonlySet<SourceEventStatus> = new Set([
  "posted",
  "linkedAsDuplicate",
  "rejected",
  "cancelled",
]);

export function isTerminal(status: SourceEventStatus): boolean {
  return TERMINAL.has(status);
}
