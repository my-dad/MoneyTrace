import { describeFollowUpContract } from "@moneytrace/application/testing";
import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import { FirestoreFollowUpRepository } from "../src/firestore/firestore-follow-up-repository";
import { ownerPath } from "../src/firestore/paths";
import { testBackend } from "./support/backend";

const { name: backend, db, clear } = await testBackend();

describeFollowUpContract(backend, async () => {
  await clear();
  return {
    repo: new FirestoreFollowUpRepository(db),
    seed: async (ownerId, record) => {
      await db
        .doc(ownerPath(ownerId, "followUps", record.id))
        .set(OWNER_COLLECTIONS.followUps.parse(record));
    },
  };
});
