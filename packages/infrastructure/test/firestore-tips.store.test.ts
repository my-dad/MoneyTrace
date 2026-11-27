import { describeTipsRepositoryContract } from "@moneytrace/application/testing";
import { FirestoreTipsRepository } from "../src/firestore/firestore-tips-repository";
import { testBackend } from "./support/backend";

const { name: backend, db, clear } = await testBackend();

describeTipsRepositoryContract(backend, async () => {
  await clear();
  return new FirestoreTipsRepository(db);
});
