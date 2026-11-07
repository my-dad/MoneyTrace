import { DomainError } from "../errors";

export type DecisionInput = {
  extractionUsable: boolean;
  invariantsPass: boolean;
  accountMappingUnambiguous: boolean;
  unresolvedDuplicateCandidate: boolean;
  parsersConflict: boolean;
  source: "deterministicParser" | "ai";
  confidenceBp: number;
  retriedAfterUnknownInChain: boolean;
  currencySupported: boolean;
  userConfirmed: boolean;
};

/** Thresholds are basis points. A value above 10000 can never be reached, so it disables AI auto-post. */
export type ConfidenceConfig = { version: number; aiAutoPostThresholdBp: number };

export type DecisionOutcome = "autoPost" | "needsClarification" | "failed";

export type DecisionResult = { outcome: DecisionOutcome; rule: string };

type DecisionRecordBase = {
  outcome: DecisionOutcome;
  rule: string;
  configVersion: number;
  aiAutoPostThresholdBp: number;
  confidenceBp: number;
  evidenceFields: readonly string[];
  retriedAfterUnknown: boolean;
  sourceEventIds: readonly string[];
};

export type DecisionRecord =
  | (DecisionRecordBase & {
      source: "deterministicParser";
      parser: { name: string; version: string };
    })
  | (DecisionRecordBase & { source: "ai"; ai: { model: string; promptVersion: string } });

function isBp(n: number, max: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= max;
}

export function decide(input: DecisionInput, config: ConfidenceConfig): DecisionResult {
  if (!isBp(input.confidenceBp, 10000)) {
    throw new DomainError("invalidConfig", "confidenceBp must be an integer from 0 to 10000");
  }
  if (!isBp(config.aiAutoPostThresholdBp, 10001)) {
    throw new DomainError(
      "invalidConfig",
      "aiAutoPostThresholdBp must be an integer from 0 to 10001",
    );
  }
  if (!input.extractionUsable) return { outcome: "failed", rule: "extractionUnusable" };
  if (!input.invariantsPass) return { outcome: "failed", rule: "invariantsFailed" };
  if (!input.currencySupported)
    return { outcome: "needsClarification", rule: "currencyUnsupported" };
  if (input.parsersConflict) return { outcome: "needsClarification", rule: "parsersConflict" };
  if (input.retriedAfterUnknownInChain && !input.userConfirmed)
    return { outcome: "needsClarification", rule: "retriedAfterUnknown" };
  if (!input.accountMappingUnambiguous)
    return { outcome: "needsClarification", rule: "accountMappingAmbiguous" };
  if (input.unresolvedDuplicateCandidate)
    return { outcome: "needsClarification", rule: "duplicateCandidateUnresolved" };
  // A confirmation answers the question; it never overrides the checks above.
  if (input.userConfirmed) return { outcome: "autoPost", rule: "userConfirmed" };
  if (input.source === "deterministicParser")
    return { outcome: "autoPost", rule: "deterministicClear" };
  if (input.confidenceBp >= config.aiAutoPostThresholdBp)
    return { outcome: "autoPost", rule: "aiAboveThreshold" };
  return { outcome: "needsClarification", rule: "aiBelowThreshold" };
}
