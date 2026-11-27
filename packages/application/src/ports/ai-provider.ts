import type { TipKind, TipsReply } from "@moneytrace/contracts";
import type { CandidateTransaction, RetrySafety } from "@moneytrace/domain";
import type { AbortSignalLike, ProviderOutcome } from "../pipeline/provider-call-executor";

/** What AI proposes. It is only ever evidence: validation and the decide stage rule on it. */
export type AiInterpretation =
  | { kind: "transaction"; candidate: CandidateTransaction; confidenceBp: number }
  | { kind: "notFinancial"; reason: string }
  /** Something needed is unclear: ask the user, with up to 4 quick answers (CR-008). */
  | { kind: "question"; text: string; options: string[]; candidate: CandidateTransaction | null }
  | { kind: "unusable" };

export type AiContext = {
  allowedCategories: readonly string[];
  nowMs: number;
  /** DeepSeek's earlier questions about this evidence and the user's answers, in order. */
  clarifications: readonly { question: string; answer: string }[];
};

/** What DeepSeek is sent for tips: our worded figures, nothing else (no shop, account or SMS). */
export type TipsInput = {
  facts: { id: string; kind: TipKind; sectorLabel?: string; headline: string; detail: string }[];
  dayOfMonth: number;
  daysInMonth: number;
};

export type AIProvider = {
  id: string;
  model: string;
  promptVersion: string;
  tipsPromptVersion: string;
  retrySafety: RetrySafety;
  interpretEvidence(
    input: { text: string; context: AiContext },
    requestKey: string,
    signal: AbortSignalLike,
  ): Promise<ProviderOutcome<AiInterpretation>>;
  /** Advice for each fact, checked by shape only; `validateAdvice` rules on what it says. */
  writeTips(input: TipsInput, requestKey: string, signal: AbortSignalLike): Promise<ProviderOutcome<TipsReply>>;
};
