import type { TipsReply } from "@moneytrace/contracts";
import { asSourceEventId, maskIdentifiers, type OwnerId, type SourceEventId } from "@moneytrace/domain";
import type { AIProvider, AiContext, AiInterpretation, TipsInput } from "../ports/ai-provider";
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

  get tipsIdentity(): { model: string; promptVersion: string } {
    return { model: this.provider.model, promptVersion: this.provider.tipsPromptVersion };
  }

  /**
   * Tips have no source event: the request key (`tips-<day>-auto`, `tips-<day>-new-<n>`) takes its
   * place, so each key is one durable, metered call and a repeat reuses its stored result.
   */
  /** Clears the stored reply of a tips call once its checked advice is saved (data minimization). */
  purgeTipsResult(ownerId: OwnerId, requestKey: string): Promise<void> {
    return this.executor.purgeTipsResult(ownerId, { sourceEventId: asSourceEventId(requestKey), stage: "tips", providerId: this.provider.id });
  }

  writeTips(ownerId: OwnerId, requestKey: string, input: TipsInput): Promise<ExecuteResult<TipsReply>> {
    return this.executor.execute<TipsReply>({
      ownerId,
      sourceEventId: asSourceEventId(requestKey),
      stage: "tips",
      provider: { id: this.provider.id, retrySafety: this.provider.retrySafety },
      estimateMicroUsd: this.estimateMicroUsd,
      invoke: (key, signal) => this.provider.writeTips(input, key, signal),
    });
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
