import { maskIdentifiers, type OwnerId, type SourceEventId } from "@moneytrace/domain";
import type { AIProvider, AiContext, AiInterpretation } from "../ports/ai-provider";
import type { ExecuteResult, ProviderCallExecutor } from "./provider-call-executor";

/** A conservative quota reservation per call, not a price. Settled when actual cost is known. */
export const DEFAULT_AI_ESTIMATE_MICRO_USD = 5000;

/** Every AI call goes through here: identifiers masked, quota reserved, outcome made durable. */
export class AIGateway {
  private readonly executor: ProviderCallExecutor;
  private readonly provider: AIProvider;
  private readonly estimateMicroUsd: number;

  constructor(executor: ProviderCallExecutor, provider: AIProvider, estimateMicroUsd: number) {
    this.executor = executor;
    this.provider = provider;
    this.estimateMicroUsd = estimateMicroUsd;
  }

  get identity(): { model: string; promptVersion: string } {
    return { model: this.provider.model, promptVersion: this.provider.promptVersion };
  }

  /**
   * `round` counts the user's answers so far. Each round is its own provider call, so a new
   * question round never reuses an earlier round's stored result.
   */
  interpret(
    ownerId: OwnerId,
    sourceEventId: SourceEventId,
    text: string,
    context: AiContext,
    round = 0,
  ): Promise<ExecuteResult<AiInterpretation>> {
    const masked = maskIdentifiers(text);
    const maskedContext: AiContext = {
      ...context,
      clarifications: context.clarifications.map((c) => ({ question: c.question, answer: maskIdentifiers(c.answer) })),
    };
    return this.executor.execute<AiInterpretation>({
      ownerId,
      sourceEventId,
      stage: "interpret",
      provider: { id: round === 0 ? this.provider.id : `${this.provider.id}-r${String(round)}`, retrySafety: this.provider.retrySafety },
      estimateMicroUsd: this.estimateMicroUsd,
      invoke: (requestKey, signal) =>
        this.provider.interpretEvidence({ text: masked, context: maskedContext }, requestKey, signal),
    });
  }
}
