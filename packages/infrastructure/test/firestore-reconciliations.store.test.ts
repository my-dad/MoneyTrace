import { describeReconciliationContract } from "@moneytrace/application/testing";
import { FirestoreFollowUpRepository } from "../src/firestore/firestore-follow-up-repository";
import { FirestoreReconciliationRepository } from "../src/firestore/firestore-reconciliation-repository";
import { testBackend } from "./support/backend";

const { name: backend, db, clear } = await testBackend();

describeReconciliationContract(backend, async () => {
  await clear();
  return { repo: new FirestoreReconciliationRepository(db), followUps: new FirestoreFollowUpRepository(db) };
});
