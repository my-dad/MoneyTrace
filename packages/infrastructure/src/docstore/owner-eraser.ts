import type { SqlRunner } from "./sql-client";

/**
 * Erases everything stored for one owner (CR-009 account deletion): every row under
 * `users/{ownerId}`, the profile itself and their AI plan. Server-side SQL, so it is one statement
 * whatever the size, and `remaining` lets the caller verify the result.
 */
export class PgOwnerEraser {
  private readonly sql: SqlRunner;

  constructor(sql: SqlRunner) {
    this.sql = sql;
  }

  async erase(ownerId: string): Promise<void> {
    await this.sql.query("delete from docs where owner_id = $1 or path = $2", [ownerId, `aiPlans/${ownerId}`]);
  }

  async remaining(ownerId: string): Promise<number> {
    const { rows } = await this.sql.query("select path, null as data from docs where owner_id = $1 or path = $2 limit 1", [
      ownerId,
      `aiPlans/${ownerId}`,
    ]);
    return rows.length;
  }
}
