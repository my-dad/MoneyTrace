import type { RetrySafety } from "@moneytrace/domain";
import type { AIProvider, AiContext, AiInterpretation } from "../ports/ai-provider";
import type { ProviderOutcome } from "../pipeline/provider-call-executor";

/** Plays scripted outcomes and counts calls; the default answer is `unusable`. */
export class ScriptedAiProvider implements AIProvider {
  readonly id = "scripted";
  readonly model = "scripted-model";
  readonly promptVersion = "scripted-v1";
  readonly retrySafety: RetrySafety;
  calls = 0;
  /** What the last call was sent: the masked text and its context (questions and answers so far). */
  lastInput: { text: string; context: AiContext } | null = null;
  private readonly steps: ProviderOutcome<AiInterpretation>[] = [];

  constructor(retrySafety: RetrySafety = "none") {
    this.retrySafety = retrySafety;
  }

  script(...steps: ProviderOutcome<AiInterpretation>[]): void {
    this.steps.push(...steps);
  }

  scriptValue(value: AiInterpretation): void {
    this.script({ kind: "success", value });
  }

  interpretEvidence(input: { text: string; context: AiContext }): Promise<ProviderOutcome<AiInterpretation>> {
    this.calls += 1;
    this.lastInput = input;
    return Promise.resolve(this.steps.shift() ?? { kind: "success", value: { kind: "unusable" } });
  }
}
