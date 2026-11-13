import { describeReconciliationContract } from "@moneytrace/application/testing";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreFollowUpRepository } from "../src/firestore/firestore-follow-up-repository";
import { FirestoreReconciliationRepository } from "../src/firestore/firestore-reconciliation-repository";

const PROJECT_ID = "demo-moneytrace";
const host = process.env["FIRESTORE_EMULATOR_HOST"];
if (host === undefined) throw new Error("run through `firebase emulators:exec`");
const firestoreHost: string = host;
process.env["METADATA_SERVER_DETECTION"] = "none";
const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));

describeReconciliationContract("firestore", async () => {
  await fetch(
    `http://${firestoreHost}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  return { repo: new FirestoreReconciliationRepository(db), followUps: new FirestoreFollowUpRepository(db) };
});
