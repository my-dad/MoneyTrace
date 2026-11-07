import { describeFollowUpContract } from "@moneytrace/application/testing";
import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreFollowUpRepository } from "../src/firestore/firestore-follow-up-repository";
import { ownerPath } from "../src/firestore/paths";

const PROJECT_ID = "demo-moneytrace";
const host = process.env["FIRESTORE_EMULATOR_HOST"];
if (host === undefined) throw new Error("run through `firebase emulators:exec`");
const firestoreHost: string = host;
process.env["METADATA_SERVER_DETECTION"] = "none";
const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));

describeFollowUpContract("firestore", async () => {
  await fetch(
    `http://${firestoreHost}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    {
      method: "DELETE",
    },
  );
  return {
    repo: new FirestoreFollowUpRepository(db),
    seed: async (ownerId, record) => {
      await db
        .doc(ownerPath(ownerId, "followUps", record.id))
        .set(OWNER_COLLECTIONS.followUps.parse(record));
    },
  };
});
