import { describePaymentInstrumentContract } from "@moneytrace/application/testing";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FirestorePaymentInstrumentRepository } from "../src/firestore/firestore-payment-instrument-repository";

const PROJECT_ID = "demo-moneytrace";
const host = process.env["FIRESTORE_EMULATOR_HOST"];
if (host === undefined) throw new Error("run through `firebase emulators:exec`");
const firestoreHost: string = host;
process.env["METADATA_SERVER_DETECTION"] = "none";
const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));

describePaymentInstrumentContract("firestore", async () => {
  await fetch(
    `http://${firestoreHost}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    {
      method: "DELETE",
    },
  );
  return new FirestorePaymentInstrumentRepository(db);
});
