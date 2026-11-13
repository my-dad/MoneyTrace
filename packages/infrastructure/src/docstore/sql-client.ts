/** A row of the `docs` table as the store reads it. */
export type DocRow = { path: string; data: unknown };

/** One statement runner: the database, or the inside of a transaction. */
export interface SqlRunner {
  query(text: string, params: readonly unknown[]): Promise<{ rows: DocRow[]; rowCount: number }>;
}

/**
 * The Postgres connection the document store needs. `serializable` runs `fn` in one SERIALIZABLE
 * transaction; a conflict surfaces as an error whose `code` is the SQLSTATE (`40001`, `40P01`).
 */
export interface SqlClient extends SqlRunner {
  serializable<T>(fn: (tx: SqlRunner) => Promise<T>): Promise<T>;
}

/** SQLSTATEs that mean "another transaction got there first: run again". */
export const RETRYABLE_SQLSTATES: ReadonlySet<string> = new Set(["40001", "40P01"]);
export const UNIQUE_VIOLATION = "23505";

export const sqlState = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
