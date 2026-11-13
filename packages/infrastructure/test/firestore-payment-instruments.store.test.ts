import { describePaymentInstrumentContract } from "@moneytrace/application/testing";
import { FirestorePaymentInstrumentRepository } from "../src/firestore/firestore-payment-instrument-repository";
import { testBackend } from "./support/backend";

const { name: backend, db, clear } = await testBackend();

describePaymentInstrumentContract(backend, async () => {
  await clear();
  return new FirestorePaymentInstrumentRepository(db);
});
