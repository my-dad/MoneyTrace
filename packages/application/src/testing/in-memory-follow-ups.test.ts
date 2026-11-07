import { describeFollowUpContract } from "./follow-up-contract";
import { InMemoryFollowUps } from "./in-memory-follow-ups";

describeFollowUpContract("in-memory", () => {
  const repo = new InMemoryFollowUps();
  return Promise.resolve({
    repo,
    seed: (ownerId, record) => {
      repo.seed(ownerId, record);
      return Promise.resolve();
    },
  });
});
