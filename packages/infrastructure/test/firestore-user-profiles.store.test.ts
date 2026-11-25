import { describeProfileContract } from "@moneytrace/application/testing";
import { FirestoreUserProfileRepository } from "../src/firestore/firestore-user-profile-repository";
import { testBackend } from "./support/backend";

const { name: backend, db, clear } = await testBackend();

describeProfileContract(backend, async () => {
  await clear();
  return new FirestoreUserProfileRepository(db);
});
