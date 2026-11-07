import { FakeClock } from "./fakes";
import { InMemorySourceEvents } from "./in-memory-source-events";
import { describeSourceEventContract } from "./source-event-contract";

describeSourceEventContract("in-memory", () => {
  const repo = new InMemorySourceEvents(new FakeClock());
  return Promise.resolve({
    repo,
    outputsOf: (ownerId, collection) => Promise.resolve(repo.outputsOf(ownerId, collection)),
  });
});
