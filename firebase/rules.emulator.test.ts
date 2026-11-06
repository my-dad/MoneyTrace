import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { OWNER_DATA_REGISTRY, UPLOAD_MAX_BYTES, UPLOAD_MIME_TYPES } from "@moneytrace/contracts";
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import {
  deleteObject,
  getBytes,
  listAll,
  ref,
  updateMetadata,
  uploadBytes,
  type StorageReference,
} from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const PROJECT_ID = "demo-moneytrace";
const storageRulesText = readFileSync(resolve(__dirname, "storage.rules"), "utf8");
const firestoreRulesText = readFileSync(resolve(__dirname, "firestore.rules"), "utf8");

// clearStorage() only removes root-level objects, so delete recursively.
const wipe = async (dir: StorageReference): Promise<void> => {
  const listing = await listAll(dir);
  await Promise.all([...listing.items.map((i) => deleteObject(i)), ...listing.prefixes.map(wipe)]);
};

// Every denial test uses a never-created id, so a denial cannot come from an existing object.
let idCounter = 0;
const fresh = (prefix: string) => `${prefix}-${String(++idCounter)}-${String(Date.now())}`;

let env: RulesTestEnvironment;

const bob = () => env.authenticatedContext("bob");
const alice = () => env.authenticatedContext("alice");
const anon = () => env.unauthenticatedContext();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: firestoreRulesText },
    storage: { rules: storageRulesText },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled((ctx) => wipe(ref(ctx.storage())));
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/bob"), { displayName: "Bob" });
    for (const name of Object.keys(OWNER_DATA_REGISTRY)) {
      await setDoc(doc(db, `users/bob/${name}/seeded`), { a: 1 });
    }
    await setDoc(doc(db, "deletionLog/x"), { a: 1 });
  });
});

describe.each(Object.entries(OWNER_DATA_REGISTRY))("firestore %s", (name, entry) => {
  it("denies another user reading", () =>
    assertFails(getDoc(doc(alice().firestore(), `users/bob/${name}/seeded`))));
  it("denies the owner writing", () =>
    assertFails(setDoc(doc(bob().firestore(), `users/bob/${name}/x`), { a: 1 })));
  it("denies the owner updating", () =>
    assertFails(setDoc(doc(bob().firestore(), `users/bob/${name}/seeded`), { a: 2 })));
  it("denies the owner deleting", () =>
    assertFails(deleteDoc(doc(bob().firestore(), `users/bob/${name}/seeded`))));
  it("denies an anonymous read", () =>
    assertFails(getDoc(doc(anon().firestore(), `users/bob/${name}/seeded`))));
  it("matches clientRead for the owner", () => {
    const read = getDoc(doc(bob().firestore(), `users/bob/${name}/seeded`));
    return entry.clientRead ? assertSucceeds(read) : assertFails(read);
  });
  it("denies another user listing the collection", () =>
    assertFails(getDocs(collection(alice().firestore(), `users/bob/${name}`))));
  it("denies a collection-group query", () =>
    assertFails(getDocs(collectionGroup(bob().firestore(), name))));
  it("matches clientRead for an owner list query", () => {
    const list = getDocs(collection(bob().firestore(), `users/bob/${name}`));
    return entry.clientRead ? assertSucceeds(list) : assertFails(list);
  });
});

describe("firestore profile and outside paths", () => {
  it("lets a user read their own profile", () =>
    assertSucceeds(getDoc(doc(bob().firestore(), "users/bob"))));
  it("denies writing the own profile", () =>
    assertFails(setDoc(doc(bob().firestore(), "users/bob"), { displayName: "X" })));
  it("denies deleting the own profile", () =>
    assertFails(deleteDoc(doc(bob().firestore(), "users/bob"))));
  it("denies another user reading the profile", () =>
    assertFails(getDoc(doc(alice().firestore(), "users/bob"))));
  it("denies an anonymous profile read", () =>
    assertFails(getDoc(doc(anon().firestore(), "users/bob"))));
  it("denies a path outside users", () =>
    assertFails(getDoc(doc(bob().firestore(), "deletionLog/x"))));
  it("denies writing outside users", () =>
    assertFails(setDoc(doc(bob().firestore(), "deletionLog/y"), { a: 1 })));
  it("denies an unregistered collection under the owner", () =>
    assertFails(getDoc(doc(bob().firestore(), "users/bob/unregistered/seeded"))));
  it("denies another user listing users", () =>
    assertFails(getDocs(collection(alice().firestore(), "users"))));
  it("denies the owner listing users", () =>
    assertFails(getDocs(collection(bob().firestore(), "users"))));
  it("declares match blocks for exactly the clientRead collections", () => {
    const matched = [...firestoreRulesText.matchAll(/match \/users\/\{uid\}\/(\w+)\/\{id\}/g)]
      .map((m) => m[1])
      .sort();
    const readable = Object.entries(OWNER_DATA_REGISTRY)
      .filter(([, e]) => e.clientRead)
      .map(([n]) => n)
      .sort();
    expect(matched).toEqual(readable);
  });
  it("denies a collection-group query over ledgerEntries", () =>
    assertFails(getDocs(collectionGroup(bob().firestore(), "ledgerEntries"))));
});

const bytes = (n: number) => new Uint8Array(n);
const uploadPath = (uid: string, id: string) => `users/${uid}/uploads/${id}`;

describe("storage uploads", () => {
  it.each(UPLOAD_MIME_TYPES)("lets the owner create a %s", async (mimeType) => {
    await assertSucceeds(
      uploadBytes(ref(bob().storage(), uploadPath("bob", fresh("ok"))), bytes(10), {
        contentType: mimeType,
      }),
    );
  });
  it("lets the owner create a 1 MB png", () =>
    assertSucceeds(
      uploadBytes(ref(bob().storage(), uploadPath("bob", fresh("u1"))), bytes(1024 * 1024), {
        contentType: "image/png",
      }),
    ));
  it("lets the owner create a file of exactly the maximum size", () =>
    assertSucceeds(
      uploadBytes(ref(bob().storage(), uploadPath("bob", fresh("max"))), bytes(UPLOAD_MAX_BYTES), {
        contentType: "application/pdf",
      }),
    ));
  it("denies another user's path", () =>
    assertFails(
      uploadBytes(ref(alice().storage(), uploadPath("bob", fresh("x"))), bytes(10), {
        contentType: "image/png",
      }),
    ));
  it("denies a 0-byte upload", () =>
    assertFails(
      uploadBytes(ref(bob().storage(), uploadPath("bob", fresh("zero"))), bytes(0), {
        contentType: "image/png",
      }),
    ));
  it("denies one byte over the limit", () =>
    assertFails(
      uploadBytes(
        ref(bob().storage(), uploadPath("bob", fresh("big"))),
        bytes(UPLOAD_MAX_BYTES + 1),
        {
          contentType: "image/png",
        },
      ),
    ));
  it("denies text/html", () =>
    assertFails(
      uploadBytes(ref(bob().storage(), uploadPath("bob", fresh("h"))), bytes(10), {
        contentType: "text/html",
      }),
    ));
  it("denies a path outside uploads", () =>
    assertFails(
      uploadBytes(ref(bob().storage(), `users/bob/other/${fresh("o")}`), bytes(10), {
        contentType: "image/png",
      }),
    ));
  it("denies no auth", () =>
    assertFails(
      uploadBytes(ref(anon().storage(), uploadPath("bob", fresh("x"))), bytes(10), {
        contentType: "image/png",
      }),
    ));
  describe("with an existing object", () => {
    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), uploadPath("bob", "old")), bytes(10), {
          contentType: "image/png",
        });
      });
    });
    it("denies the owner overwriting", () =>
      assertFails(
        uploadBytes(ref(bob().storage(), uploadPath("bob", "old")), bytes(10), {
          contentType: "image/png",
        }),
      ));
    it("denies the owner updating metadata", () =>
      assertFails(
        updateMetadata(ref(bob().storage(), uploadPath("bob", "old")), {
          contentType: "image/jpeg",
        }),
      ));
    it("denies the owner listing uploads", () =>
      assertFails(listAll(ref(bob().storage(), "users/bob/uploads"))));
    it("denies another user listing uploads", () =>
      assertFails(listAll(ref(alice().storage(), "users/bob/uploads"))));
    it("denies the owner reading", () =>
      assertFails(getBytes(ref(bob().storage(), uploadPath("bob", "old")))));
    it("denies the owner deleting", () =>
      assertFails(deleteObject(ref(bob().storage(), uploadPath("bob", "old")))));
  });
});

describe("storage.rules limits match contracts", () => {
  it("uses the contract maximum size", () => {
    expect(storageRulesText).toContain(`request.resource.size <= ${String(UPLOAD_MAX_BYTES)}`);
  });
  it("allows exactly the contract MIME types", () => {
    const m = /request\.resource\.contentType in \[([^\]]*)\]/.exec(storageRulesText);
    const listed = (m?.[1] ?? "").split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
    expect([...listed].sort()).toEqual([...UPLOAD_MIME_TYPES].sort());
  });
});
