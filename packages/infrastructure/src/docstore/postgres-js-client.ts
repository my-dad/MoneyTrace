import type { Sql, TransactionSql } from "postgres";
import type { DocRow, SqlClient, SqlRunner } from "./sql-client";

const runner = (sql: Sql | TransactionSql): SqlRunner => ({
  async query(text, params) {
    const rows = await sql.unsafe(text, params as never[]);
    return { rows: rows as unknown as DocRow[], rowCount: rows.count };
  },
});

/**
 * The production `SqlClient` (CR-010): postgres.js, as the Edge Function runs it. Connect through
 * Supabase's transaction pooler with `prepare: false`. Errors keep postgres.js's SQLSTATE `code`.
 */
export function postgresJsClient(sql: Sql): SqlClient {
  return {
    ...runner(sql),
    serializable: <T>(fn: (tx: SqlRunner) => Promise<T>) =>
      sql.begin("isolation level serializable", (tx) => fn(runner(tx))) as Promise<T>,
  };
}
