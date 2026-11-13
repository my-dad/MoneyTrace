import { signInAnonymously, signOut } from "firebase/auth";
import { collection, getDocsFromServer, terminate, type FirestoreError } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ReadModelGateway } from "./read-model-gateway";

const PROJECT = "demo-moneytrace";

process.env.NEXT_PUBLIC_USE_EMULATORS = "1";
const { auth, db } = (await import("./firebase")).firebase();
const { createFirebaseReadModelGateway } = await import("./firebase-read-model-gateway");

type Field = { stringValue: string } | { integerValue: string };
const field = (value: string | number): Field =>
  typeof value === "number" ? { integerValue: String(value) } : { stringValue: value };

/** Seeds past the rules, as server code would: clients never write these collections. */
async function seed(path: string, id: string, data: Record<string, string | number>) {
  const url = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/${path}?documentId=${id}`;
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, field(v)]));
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  expect(response.ok).toBe(true);
}

const firstAccounts = (gateway: ReadModelGateway) =>
  new Promise<string[]>((resolve, reject) => {
    const stop = gateway.watchAccounts(
      (rows) => {
        stop();
        resolve(rows.map((row) => row.id));
      },
      reject,
    );
  });

describe("firebase read model gateway", () => {
  let ownerUid = "";

  beforeAll(async () => {
    const { user } = await signInAnonymously(auth);
    ownerUid = user.uid;
    await seed(`users/${ownerUid}/accounts`, "bank-1", {
      id: "bank-1",
      kind: "bank",
      name: "City Bank",
      currency: "BDT",
      status: "active",
      createdAtMs: 1,
    });
  });

  afterAll(async () => {
    await signOut(auth);
    await terminate(db);
  });

  it("an owner's listeners see their data", async () => {
    await expect(firstAccounts(createFirebaseReadModelGateway())).resolves.toEqual(["bank-1"]);
  });

  it("another user sees none of it, and the rules deny reading it directly", async () => {
    await signOut(auth);
    await signInAnonymously(auth);
    await expect(firstAccounts(createFirebaseReadModelGateway())).resolves.toEqual([]);
    // From the server: a listener could first answer from the SDK's local cache.
    const code = await getDocsFromServer(collection(db, `users/${ownerUid}/accounts`)).then(
      () => "allowed",
      (error: unknown) => (error as FirestoreError).code,
    );
    expect(code).toBe("permission-denied");
  });
});
