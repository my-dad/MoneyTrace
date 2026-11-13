import { InMemoryFollowUps } from "./in-memory-follow-ups";
import { InMemoryReconciliations } from "./in-memory-reconciliations";
import { describeReconciliationContract } from "./reconciliation-contract";

describeReconciliationContract("in-memory", () => {
  const followUps = new InMemoryFollowUps();
  return Promise.resolve({ repo: new InMemoryReconciliations(followUps), followUps });
});
