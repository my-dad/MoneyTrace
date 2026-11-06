import { DomainError } from "../errors";

export type TransactionState = "pending" | "posted" | "rejected" | "reversed";

const ALLOWED: ReadonlySet<string> = new Set([
  "null>pending",
  "null>posted",
  "pending>posted",
  "pending>rejected",
  "posted>reversed",
]);

export function assertTransition(from: TransactionState | null, to: TransactionState): void {
  if (!ALLOWED.has(`${from ?? "null"}>${to}`)) {
    throw new DomainError(
      "invalidTransition",
      `Transaction cannot move from ${from ?? "none"} to ${to}`,
    );
  }
}
