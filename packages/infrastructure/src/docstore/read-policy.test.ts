import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { OWNER_DATA_REGISTRY } from "@moneytrace/contracts";
import { beforeAll, describe, expect, it } from "vitest";

const migration = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../supabase/migrations/${name}`, import.meta.url)), "utf8");
const POLICY = migration("20261113000100_docs_read_policy.sql");

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";

/** Supabase's roles and `auth.uid()`, as far as the policy needs them. */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  grant usage on schema auth to authenticated, anon;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`;

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(migration("20261113000000_docs.sql"));
  await db.exec(POLICY);
  const put = (path: string, owner: string | null) => {
    const segs = path.split("/");
    return db.query("insert into docs (path, parent, collection_id, owner_id, data) values ($1, $2, $3, $4, '{}')", [
      path,
      segs.slice(0, -1).join("/"),
      segs.at(-2),
      owner,
    ]);
  };
  for (const uid of [ALICE, BOB]) {
    for (const collection of Object.keys(OWNER_DATA_REGISTRY)) await put(`users/${uid}/${collection}/r1`, uid);
    await put(`users/${uid}`, uid);
    await put(`users/${uid}/accounts/cash`, uid);
    await put(`users/${uid}/idempotencyRecords/k1`, uid);
    await put(`users/${uid}/accounts/cash/nested/x`, uid);
  }
  await put("rateLimits/w1", null);
});

async function as(uid: string | null, sql: string): Promise<string[]> {
  return db.transaction(async (tx) => {
    await tx.query(`set local role ${uid === null ? "anon" : "authenticated"}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    const r = await tx.query<{ path: string }>(sql);
    return r.rows.map((x) => x.path).sort();
  });
}

describe("docs read policy (replaces firestore.rules)", () => {
  it("a user reads their own profile and client-readable collections only", async () => {
    const readable = Object.entries(OWNER_DATA_REGISTRY).filter(([, v]) => v.clientRead).map(([k]) => `users/${ALICE}/${k}/r1`);
    expect(await as(ALICE, "select path from docs")).toEqual([`users/${ALICE}`, `users/${ALICE}/accounts/cash`, ...readable].sort());
  });

  it.each(Object.entries(OWNER_DATA_REGISTRY))("%s: the owner sees it exactly when clientRead, another user never", async (collection, entry) => {
    const own = await as(ALICE, `select path from docs where collection_id = '${collection}' and path like 'users/%/${collection}/r1'`);
    expect(own).toEqual(entry.clientRead ? [`users/${ALICE}/${collection}/r1`] : []);
    expect(own.some((p) => p.includes(BOB))).toBe(false);
  });

  it("never another user's rows, server-only collections, nested paths or top-level collections", async () => {
    const seen = await as(BOB, "select path from docs");
    expect(seen.some((p) => p.includes(ALICE))).toBe(false);
    expect(seen.some((p) => p.includes("idempotencyRecords") || p.includes("nested") || p.startsWith("rateLimits"))).toBe(false);
  });

  it("a signed-out visitor reads nothing", async () => {
    await expect(as(null, "select path from docs")).rejects.toThrow(/permission denied/);
  });

  it.each([
    ["insert", `insert into docs (path, parent, collection_id, owner_id, data) values ('users/${ALICE}/accounts/x', 'users/${ALICE}/accounts', 'accounts', '${ALICE}', '{}')`],
    ["update", "update docs set data = '{\"hacked\":true}'"],
    ["delete", "delete from docs"],
  ])("a signed-in user cannot %s", async (_n, sql) => {
    await expect(as(ALICE, sql)).rejects.toThrow(/permission denied/);
  });

  it("lists exactly the registry's client-readable collections", () => {
    const listed = [...POLICY.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]).filter((n) => n !== undefined && n !== "users");
    const readable = Object.entries(OWNER_DATA_REGISTRY).filter(([, v]) => v.clientRead).map(([k]) => k);
    expect([...new Set(listed)].sort()).toEqual(readable.sort());
  });
});
