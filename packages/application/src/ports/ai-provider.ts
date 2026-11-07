import type { CandidateTransaction, RetrySafety } from "@moneytrace/domain";
import type { AbortSignalLike, ProviderOutcome } from "../pipeline/provider-call-executor";

/** What AI proposes. It is only ever evidence: validation and the decide stage rule on it. */
export type AiInterpretation =
  | { kind: "transaction"; candidate: CandidateTransaction; confidenceBp: number }
  | { kind: "notFinancial"; reason: string }
  | { kind: "unusable" };

export type AiContext = { allowedCategories: readonly string[]; nowMs: number };

export type AIProvider = {
  id: string;
  model: string;
  promptVersion: string;
  retrySafety: RetrySafety;
  interpretEvidence(
    input: { text: string; context: AiContext },
    requestKey: string,
    signal: AbortSignalLike,
  ): Promise<ProviderOutcome<AiInterpretation>>;
};
