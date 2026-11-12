import { asOwnerId, asSourceEventId } from "@moneytrace/domain";
import { describe, expect, it } from "vitest";
import type { AIProvider, AiInterpretation } from "../ports/ai-provider";
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
    retrySafety: "none",
    interpretEvidence: (input) => {
      texts.push(input.text);
      return Promise.resolve(outcome);
    },
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
});
