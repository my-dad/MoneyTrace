import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALREADY_EXISTS } from "./doc-store";
import { PgDocStore } from "./pg-doc-store";
import { postgresJsClient } from "./postgres-js-client";

const MIGRATION = fileURLToPath(new URL("../../../../supabase/migrations/20261113000000_docs.sql", import.meta.url));
const PORT = 54_000 + Math.floor(Math.random() * 1000);

let server: PGLiteSocketServer;
let sql: postgres.Sql;
let store: PgDocStore;
beforeAll(async () => {
  const db = new PGlite();
  await db.exec(readFileSync(MIGRATION, "utf8"));
  server = new PGLiteSocketServer({ db, port: PORT });
  await server.start();
  // Same options as production: the transaction pooler can't hold prepared statements.
  sql = postgres({ host: "127.0.0.1", port: PORT, database: "postgres", username: "postgres", max: 1, prepare: false, onnotice: () => undefined });
  store = new PgDocStore(postgresJsClient(sql));
});
afterAll(async () => {
  await sql.end();
  await server.stop();
});

describe("postgres.js client (the Edge Function's driver)", () => {
  it("writes and reads JSON documents, with numbers and nested maps intact", async () => {
    await store.doc("users/u1/accounts/cash").set({ minor: 9_007_199_254_740_991, nested: { ok: true }, list: ["a", 1] });
    expect((await store.doc("users/u1/accounts/cash").get()).data()).toEqual({ minor: 9_007_199_254_740_991, nested: { ok: true }, list: ["a", 1] });
  });

  it("runs queries with jsonb parameters", async () => {
    await store.doc("users/u1/entries/e1").set({ ms: 5 });
    await store.doc("users/u1/entries/e2").set({ ms: 9 });
    const snap = await store.collection("users/u1/entries").where("ms", ">", 6).get();
    expect(snap.docs.map((d) => d.id)).toEqual(["e2"]);
  });

  it("commits a serializable transaction and rolls one back", async () => {
    await store.runTransaction(async (tx) => {
      const s = await tx.get(store.doc("c/t"));
      tx.set(store.doc("c/t"), { n: s.exists ? 2 : 1 });
    });
    await expect(
      store.runTransaction((tx) => {
        tx.set(store.doc("c/t"), { n: 99 });
        return Promise.reject(new Error("boom"));
      }),
    ).rejects.toThrow("boom");
    expect((await store.doc("c/t").get()).get("n")).toBe(1);
  });

  it("maps a duplicate create to ALREADY_EXISTS through the driver's SQLSTATE", async () => {
    await store.doc("c/once").create({ n: 1 });
    await expect(store.doc("c/once").create({ n: 2 })).rejects.toEqual(expect.objectContaining({ code: ALREADY_EXISTS }));
  });

  it("stores documents as JSON objects, not JSON-encoded strings", async () => {
    await store.doc("c/shape").set({ a: 1 });
    const [row] = await sql`select jsonb_typeof(data) as t from docs where path = 'c/shape'`;
    expect(row?.["t"]).toBe("object");
  });
});
