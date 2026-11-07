import { FakeClock, SequentialIdGenerator } from "./fakes";
import { InMemoryAiUsage, InMemoryQuota } from "./in-memory-quota";
import { InMemoryProviderCalls } from "./in-memory-provider-calls";
import { InMemorySourceEvents } from "./in-memory-source-events";
import {
  describeAiUsageContract,
  describeProviderCallContract,
  describeQuotaContract,
} from "./provider-call-contract";

describeProviderCallContract("in-memory", () => {
  const clock = new FakeClock();
  const sourceEvents = new InMemorySourceEvents(clock);
  const calls = new InMemoryProviderCalls(sourceEvents, clock);
  return Promise.resolve({
    calls,
    sourceEvents,
    nowMs: () => clock.nowMs(),
    docsOf: (ownerId, collection) =>
      Promise.resolve(collection === "providerCalls" ? calls.docsOf(ownerId) : []),
  });
});

describeQuotaContract("in-memory", () => {
  const clock = new FakeClock();
  const quota = new InMemoryQuota(clock, new SequentialIdGenerator());
  return Promise.resolve({
    quota,
    setNowMs: (ms) => {
      clock.advance(ms - clock.nowMs());
    },
    docsOf: (ownerId, collection) =>
      Promise.resolve(collection === "quotaCounters" ? quota.docsOf(ownerId) : []),
  });
});

describeAiUsageContract("in-memory", () => {
  const usage = new InMemoryAiUsage();
  return Promise.resolve({
    usage,
    docsOf: (ownerId, collection) =>
      Promise.resolve(collection === "aiUsage" ? usage.docsOf(ownerId) : []),
  });
});
