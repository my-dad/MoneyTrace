import { describeMerchantSectorContract } from "@moneytrace/application/testing";
import { FirestoreMerchantSectorRepository } from "../src/firestore/firestore-merchant-sector-repository";
import { testBackend } from "./support/backend";

const { name: backend, db, clear } = await testBackend();

describeMerchantSectorContract(backend, async () => {
  await clear();
  return new FirestoreMerchantSectorRepository(db);
});
