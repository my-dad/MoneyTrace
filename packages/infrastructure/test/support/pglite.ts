import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { DocRow, SqlClient, SqlRunner } from "../../src/docstore/sql-client";
import { PgDocStore } from "../../src/docstore/pg-doc-store";

const MIGRATION = fileURLToPath(
  new URL("../../../../supabase/migrations/20261113000000_docs.sql", import.meta.url),
);

const runner = (db: Pick<PGlite, "query">): SqlRunner => ({
  async query(text, params) {
    const r = await db.query<DocRow>(text, params as unknown[]);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  },
});

/** In-process Postgres (no Docker) with the real migration applied. One connection: no real concurrency. */
export async function pgliteStore(): Promise<{
  store: PgDocStore;
  client: SqlClient;
  reset: () => Promise<void>;
}> {
  const db = new PGlite();
  await db.exec(readFileSync(MIGRATION, "utf8"));
  const client: SqlClient = {
    ...runner(db),
    serializable: (fn) =>
      db.transaction(async (tx) => {
        await tx.query("set transaction isolation level serializable");
        return fn(runner(tx));
      }),
  };
  return {
    store: new PgDocStore(client),
    client,
    reset: async () => {
      await db.exec("truncate docs");
    },
  };
}
