import { ProviderCallExecutor } from "@moneytrace/application";
import {
  FakeClock,
  FakeProvider,
  InMemoryAiUsage,
  InMemoryProviderCalls,
  InMemoryQuota,
  InMemorySourceEvents,
  SequentialIdGenerator,
  liveSignal,
} from "@moneytrace/application/testing";
import { asOwnerId, asSourceEventId } from "@moneytrace/domain";
import { describe, expect, it } from "vitest";
import { JsonLogger } from "./json-logger";

describe("provider call events through the real JsonLogger", () => {
  it("keeps the quota window and the error name instead of dropping them", async () => {
    const lines: string[] = [];
    const clock = new FakeClock();
    const executor = new ProviderCallExecutor({
      providerCalls: new InMemoryProviderCalls(new InMemorySourceEvents(clock), clock),
      quota: new InMemoryQuota(clock, new SequentialIdGenerator()),
      usage: new InMemoryAiUsage(),
      clock,
      logger: new JsonLogger((l) => lines.push(l)),
      timeoutSignal: liveSignal,
      limits: { perRequestMicroUsd: 100, dailyMicroUsd: 100, monthlyMicroUsd: 1_000 },
    });
    const provider = new FakeProvider("deepseek", "none");
    provider.script(new TypeError("socket"));
    await executor.execute({
      ownerId: asOwnerId("alice"),
      sourceEventId: asSourceEventId("evt-1"),
      stage: "interpret",
      provider,
      estimateMicroUsd: 90,
      invoke: provider.invoke,
    });
    const events = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(events.find((e) => e["event"] === "quotaWarning")).toEqual({
      level: "warn",
      event: "quotaWarning",
      window: "daily",
      sourceEventId: "evt-1",
    });
    expect(events.find((e) => e["event"] === "provider.callFailed")).toMatchObject({
      errorName: "TypeError",
      stage: "interpret",
    });
    for (const e of events) expect(e).not.toHaveProperty("droppedFieldCount");
  });
});
