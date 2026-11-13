import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pgliteStore } from "../../test/support/pglite";
import { ABORTED, ALREADY_EXISTS } from "./doc-store";
import type { PgDocStore } from "./pg-doc-store";
import type { SqlClient } from "./sql-client";

let store: PgDocStore;
let client: SqlClient;
let reset: () => Promise<void>;
beforeAll(async () => {
  ({ store, client, reset } = await pgliteStore());
});
beforeEach(() => reset());

const code = (c: number) => expect.objectContaining({ code: c }) as Error;

describe("PgDocStore documents", () => {
  it("reads back what was set, as a fresh copy", async () => {
    const ref = store.collection("users/alice/accounts").doc("cash");
    await ref.set({ name: "Cash", balance: { minor: 500 } });
    const snap = await ref.get();
    expect(snap.exists).toBe(true);
    expect(snap.id).toBe("cash");
    expect(snap.get("balance.minor")).toBe(500);
    const copy = snap.data();
    (copy as { name: string }).name = "changed";
    expect(snap.data()).toEqual({ name: "Cash", balance: { minor: 500 } });
  });

  it("a missing document does not exist", async () => {
    const snap = await store.doc("users/alice/accounts/none").get();
    expect(snap.exists).toBe(false);
    expect(snap.data()).toBeUndefined();
  });

  it("set replaces the whole document", async () => {
    const ref = store.doc("users/alice/accounts/cash");
    await ref.set({ a: 1, b: 2 });
    await ref.set({ a: 3 });
    expect((await ref.get()).data()).toEqual({ a: 3 });
  });

  it("create refuses an existing document with ALREADY_EXISTS", async () => {
    const ref = store.doc("aiUsage/u1");
    await ref.create({ n: 1 });
    await expect(ref.create({ n: 2 })).rejects.toEqual(code(ALREADY_EXISTS));
    expect((await ref.get()).get("n")).toBe(1);
  });

  it("delete removes the document", async () => {
    const ref = store.doc("users/alice/accounts/cash");
    await ref.set({ a: 1 });
    await ref.delete();
    expect((await ref.get()).exists).toBe(false);
  });

  it("knows its parents, like Firestore", () => {
    const ref = store.doc("users/alice/sourceEvents/e1");
    expect(ref.parent.id).toBe("sourceEvents");
    expect(ref.parent.parent?.id).toBe("alice");
    expect(ref.parent.parent?.parent.id).toBe("users");
    expect(store.collection("rateLimits").parent).toBeNull();
  });

  it("getAll keeps the order asked and includes missing documents", async () => {
    await store.doc("c/a").set({ v: "a" });
    await store.doc("c/c").set({ v: "c" });
    const snaps = await store.getAll(store.doc("c/c"), store.doc("c/b"), store.doc("c/a"));
    expect(snaps.map((s) => [s.id, s.exists])).toEqual([["c", true], ["b", false], ["a", true]]);
  });

  it("rejects malformed paths and field names", () => {
    expect(() => store.doc("users/alice")).not.toThrow();
    expect(() => store.doc("users")).toThrow();
    expect(() => store.collection("users/alice")).toThrow();
    expect(() => store.collection("c").where("a'; drop table docs;--", "==", 1)).toThrow();
  });
});

describe("PgDocStore queries", () => {
  beforeEach(async () => {
    await store.doc("users/alice/entries/e1").set({ accountId: "cash", ms: 30, claim: { at: 5 } });
    await store.doc("users/alice/entries/e2").set({ accountId: "cash", ms: 10 });
    await store.doc("users/alice/entries/e3").set({ accountId: "bank", ms: 20, claim: { at: 1 } });
    await store.doc("users/alice/entries/e4").set({ accountId: "cash", ms: "20" });
    await store.doc("users/bob/entries/b1").set({ accountId: "cash", ms: 15, claim: { at: 3 } });
  });

  const ids = (s: { docs: { id: string }[] }) => s.docs.map((d) => d.id);

  it("equality filters within one collection only", async () => {
    expect(ids(await store.collection("users/alice/entries").where("accountId", "==", "cash").get())).toEqual(["e1", "e2", "e4"]);
  });

  it("range filters match only the same JSON type", async () => {
    expect(ids(await store.collection("users/alice/entries").where("ms", ">=", 20).get())).toEqual(["e1", "e3"]);
    expect(ids(await store.collection("users/alice/entries").where("ms", ">=", 20).orderBy("ms").get())).toEqual(["e3", "e1"]);
    expect(ids(await store.collection("users/alice/entries").where("ms", "<", 20).get())).toEqual(["e2"]);
  });

  it("orderBy skips documents without the field and limits", async () => {
    const q = store.collectionGroup("entries").where("claim.at", "<=", 4).orderBy("claim.at").limit(5);
    expect(ids(await q.get())).toEqual(["e3", "b1"]);
    expect(ids(await store.collectionGroup("entries").orderBy("claim.at", "desc").limit(2).get())).toEqual(["e1", "b1"]);
  });

  it("a collection group spans owners; results carry their owner path", async () => {
    const snap = await store.collectionGroup("entries").where("accountId", "==", "cash").get();
    expect(snap.docs.map((d) => d.ref.path)).toEqual([
      "users/alice/entries/e1",
      "users/alice/entries/e2",
      "users/alice/entries/e4",
      "users/bob/entries/b1",
    ]);
    expect(snap.docs[3]?.ref.parent.parent?.id).toBe("bob");
  });
});

describe("PgDocStore transactions", () => {
  it("writes apply together when the function returns", async () => {
    const a = store.doc("c/a");
    const b = store.doc("c/b");
    const out = await store.runTransaction(async (tx) => {
      const s = await tx.get(a);
      tx.set(a, { n: s.exists ? 2 : 1 }).set(b, { n: 1 });
      return "done";
    });
    expect(out).toBe("done");
    expect((await store.getAll(a, b)).map((s) => s.get("n"))).toEqual([1, 1]);
  });

  it("a throw leaves nothing written", async () => {
    await expect(
      store.runTransaction(async (tx) => {
        tx.set(store.doc("c/a"), { n: 1 });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect((await store.doc("c/a").get()).exists).toBe(false);
  });

  it("create on an existing document fails the whole transaction", async () => {
    await store.doc("c/a").set({ n: 1 });
    await expect(
      store.runTransaction(async (tx) => {
        tx.set(store.doc("c/b"), { n: 1 }).create(store.doc("c/a"), { n: 2 });
      }),
    ).rejects.toEqual(code(ALREADY_EXISTS));
    expect((await store.doc("c/b").get()).exists).toBe(false);
  });

  it("reads queries inside the transaction", async () => {
    await store.doc("users/alice/q/1").set({ s: "open" });
    const n = await store.runTransaction(async (tx) => (await tx.get(store.collection("users/alice/q").where("s", "==", "open"))).size);
    expect(n).toBe(1);
  });

  it("a serialization conflict retries, then gives up with ABORTED", async () => {
    let calls = 0;
    const conflict = Object.assign(new Error("could not serialize"), { code: "40001" });
    const flaky: SqlClient = { ...client, serializable: async (fn) => (++calls < 3 ? Promise.reject(conflict) : client.serializable(fn)) };
    const { PgDocStore: Store } = await import("./pg-doc-store");
    expect(await new Store(flaky).runTransaction(async () => "ok")).toBe("ok");
    expect(calls).toBe(3);
    calls = -100;
    await expect(new Store(flaky).runTransaction(async () => "ok", { maxAttempts: 2 })).rejects.toEqual(code(ABORTED));
  });
});
