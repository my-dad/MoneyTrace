import type { DocStore } from "../../src/docstore/doc-store";
import { pgliteStore } from "./pglite";

export type TestBackend = {
  name: "postgres";
  db: DocStore;
  clear: () => Promise<void>;
};

/** A real Postgres (CI's service container): concurrent transactions really race here. */
async function realPostgres(url: string): Promise<TestBackend> {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { default: postgres } = await import("postgres");
  const { PgDocStore } = await import("../../src/docstore/pg-doc-store");
  const { postgresJsClient } = await import("../../src/docstore/postgres-js-client");
  const sql = postgres(url, { max: 10, prepare: false, onnotice: () => undefined });
  const migration = fileURLToPath(new URL("../../../../supabase/migrations/20261113000000_docs.sql", import.meta.url));
  // Files run one at a time against it (fileParallelism off in CI), and the migration is idempotent.
  await sql.unsafe(readFileSync(migration, "utf8"));
  return {
    name: "postgres",
    db: new PgDocStore(postgresJsClient(sql)),
    clear: async () => {
      await sql`truncate docs`;
    },
  };
}

/**
 * The store the adapter suites run on: Postgres (PGlite, in `pnpm test`) by default, or a real
 * Postgres when MONEYTRACE_TEST_PG_URL is set (CI). Same suite, same behaviour (CR-010).
 */
export async function testBackend(): Promise<TestBackend> {
  const pgUrl = process.env["MONEYTRACE_TEST_PG_URL"];
  if (pgUrl !== undefined && pgUrl !== "") return realPostgres(pgUrl);
  const { store, reset } = await pgliteStore();
  return { name: "postgres", db: store, clear: reset };
}
