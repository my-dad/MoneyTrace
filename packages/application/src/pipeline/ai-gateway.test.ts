import { asOwnerId, asSourceEventId } from "@moneytrace/domain";
import { describe, expect, it } from "vitest";
import type { AIProvider, AiInterpretation, TipsInput } from "../ports/ai-provider";
import { ScriptedAiProvider } from "../testing/scripted-ai-provider";
import { createProviderWorld } from "../testing/fake-provider";
import { AIGateway, DEFAULT_AI_ESTIMATE_MICRO_USD } from "./ai-gateway";
import type { ProviderOutcome } from "./provider-call-executor";

const owner = asOwnerId("alice");
const event = asSourceEventId("evt-1");
const context = { allowedCategories: [], nowMs: 1, clarifications: [] };

function recordingProvider(outcome: ProviderOutcome<AiInterpretation>) {
  const texts: string[] = [];
  const provider: AIProvider = {
    id: "fake",
    model: "m",
    promptVersion: "v1",
    tipsPromptVersion: "tips-v1",
    retrySafety: "none",
    interpretEvidence: (input) => {
      texts.push(input.text);
      return Promise.resolve(outcome);
    },
    writeTips: () => Promise.resolve({ kind: "success", value: { tips: [] } }),
  };
  return { provider, texts };
}

async function seed(world: ReturnType<typeof createProviderWorld>) {
  await world.sourceEvents.create(owner, {
    sourceEventId: event,
    sourceType: "chat",
    sourceHash: "h",
    idempotencyKey: "k",
    receivedAtMs: 1,
  });
}

describe("AIGateway", () => {
  const unusable = { kind: "success", value: { kind: "unusable" } } as const;

  it("masks long digit runs before the provider sees them", async () => {
    const world = createProviderWorld();
    await seed(world);
    const { provider, texts } = recordingProvider(unusable);
    const gateway = new AIGateway(world.executor(), provider, DEFAULT_AI_ESTIMATE_MICRO_USD);
    await gateway.interpret(owner, event, "A/C 1234567890 paid 500", context);
    expect(texts).toEqual(["A/C **7890 paid 500"]);
  });

  it("charges the reservation to quota and returns the result", async () => {
    const world = createProviderWorld();
    await seed(world);
    const { provider } = recordingProvider(unusable);
    const gateway = new AIGateway(world.executor(), provider, DEFAULT_AI_ESTIMATE_MICRO_USD);
    expect(await gateway.interpret(owner, event, "text", context)).toEqual({
      kind: "result",
      value: { kind: "unusable" },
      retriedAfterUnknown: false,
    });
  });

  it("an unknown outcome is not repeated: the second call does not reach the provider", async () => {
    const world = createProviderWorld();
    await seed(world);
    const { provider, texts } = recordingProvider({ kind: "unknown", code: "timeout" });
    const gateway = new AIGateway(world.executor(), provider, DEFAULT_AI_ESTIMATE_MICRO_USD);
    expect((await gateway.interpret(owner, event, "text", context)).kind).toBe("awaitUserDecision");
    expect((await gateway.interpret(owner, event, "text", context)).kind).toBe("awaitUserDecision");
    expect(texts).toHaveLength(1);
  });

  it("the estimate is a positive integer in micro-USD", () => {
    expect(Number.isInteger(DEFAULT_AI_ESTIMATE_MICRO_USD)).toBe(true);
    expect(DEFAULT_AI_ESTIMATE_MICRO_USD).toBeGreaterThan(0);
  });

  describe("writeTips", () => {
    const tipsInput: TipsInput = {
      facts: [{ id: "unsorted", kind: "unsorted", headline: "৳2,500 isn't sorted yet", detail: "Sorting it shows where it went" }],
      dayOfMonth: 27,
      daysInMonth: 30,
    };
    const advice = { tips: [{ factId: "unsorted", advice: "Sort a few shops each week." }] };

    it("is a durable provider call of the tips stage, keyed by the request key", async () => {
      const world = createProviderWorld();
      const provider = new ScriptedAiProvider();
      provider.scriptTips({ kind: "success", value: advice });
      const gateway = new AIGateway(world.executor(), provider, DEFAULT_AI_ESTIMATE_MICRO_USD);
      expect(await gateway.writeTips(owner, "tips-2026-11-27-auto", tipsInput)).toEqual({ kind: "result", value: advice, retriedAfterUnknown: false });
      const [call] = await world.calls.listForStage(owner, asSourceEventId("tips-2026-11-27-auto"), "tips");
      expect(call).toMatchObject({ stage: "tips", sourceEventId: "tips-2026-11-27-auto", state: "succeeded" });
      expect(provider.lastTipsInput).toEqual(tipsInput);
    });

    it("the same request key reuses the stored advice", async () => {
      const world = createProviderWorld();
      const provider = new ScriptedAiProvider();
      provider.scriptTips({ kind: "success", value: advice });
      const gateway = new AIGateway(world.executor(), provider, DEFAULT_AI_ESTIMATE_MICRO_USD);
      await gateway.writeTips(owner, "tips-2026-11-27-new-1", tipsInput);
      expect(await gateway.writeTips(owner, "tips-2026-11-27-new-1", tipsInput)).toMatchObject({ kind: "result", value: advice });
      expect(provider.tipsCalls).toBe(1);
    });

    it("says when the AI budget is used up, without calling", async () => {
      const world = createProviderWorld();
      const provider = new ScriptedAiProvider();
      const gateway = new AIGateway(world.executor({ limits: { perRequestMicroUsd: 1, dailyMicroUsd: 1, monthlyMicroUsd: 1 } }), provider, DEFAULT_AI_ESTIMATE_MICRO_USD);
      expect((await gateway.writeTips(owner, "tips-2026-11-27-auto", tipsInput)).kind).toBe("quotaExhausted");
      expect(provider.tipsCalls).toBe(0);
    });

    it("names the model and the tips prompt version", () => {
      const world = createProviderWorld();
      const gateway = new AIGateway(world.executor(), new ScriptedAiProvider(), DEFAULT_AI_ESTIMATE_MICRO_USD);
      expect(gateway.tipsIdentity).toEqual({ model: "scripted-model", promptVersion: "scripted-tips-v1" });
    });
  });
});
