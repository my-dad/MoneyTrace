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

  interpret(
    ownerId: OwnerId,
    sourceEventId: SourceEventId,
    text: string,
    context: AiContext,
  ): Promise<ExecuteResult<AiInterpretation>> {
    const masked = maskIdentifiers(text);
    return this.executor.execute<AiInterpretation>({
      ownerId,
      sourceEventId,
      stage: "interpret",
      provider: { id: this.provider.id, retrySafety: this.provider.retrySafety },
      estimateMicroUsd: this.estimateMicroUsd,
      invoke: (requestKey, signal) =>
        this.provider.interpretEvidence({ text: masked, context }, requestKey, signal),
    });
  }
}
