import type { CandidateTransaction } from "./candidate";

export type Direction = "in" | "out";

export type ExistingTransaction = {
  transactionId: string;
  state: "pending" | "posted";
  accountId: string;
  direction: Direction;
  amountMinor: number;
  currency: string;
  occurredAtMs: number;
  reference?: string;
  isAuthorization: boolean;
};

export type MatchResult =
  | { kind: "none" }
  | { kind: "duplicate"; transactionId: string }
  | { kind: "ambiguous"; transactionIds: string[] }
  | { kind: "finalizesAuthorization"; transactionId: string }
  | { kind: "possibleCounterpart"; transactionId: string };

export type MatchConfig = { windowMs: number };

export const DEFAULT_MATCH_CONFIG: MatchConfig = { windowMs: 600_000 };

const MINUTE_MS = 60_000;

const ids = (rows: readonly ExistingTransaction[]): string[] => rows.map((r) => r.transactionId);

const one = (rows: readonly ExistingTransaction[]): ExistingTransaction | undefined =>
  rows.length === 1 ? rows[0] : undefined;

/** A link is made only on unique evidence. Anything less asks; equal amounts never merge alone. */
export function matchCandidate(
  candidate: CandidateTransaction,
  accountId: string,
  direction: Direction,
  existing: readonly ExistingTransaction[],
  config: MatchConfig,
): MatchResult {
  const same = existing.filter(
    (e) => e.amountMinor === candidate.amountMinor && e.currency === candidate.currency,
  );
  const sameAccount = same.filter((e) => e.accountId === accountId && e.direction === direction);

  const { reference, occurredAtMs } = candidate;
  if (reference !== undefined) {
    const byReference = one(sameAccount.filter((e) => e.reference === reference));
    if (byReference !== undefined) {
      return { kind: "duplicate", transactionId: byReference.transactionId };
    }
  }
  if (occurredAtMs === null) return { kind: "none" };

  const inWindow = (e: ExistingTransaction): boolean =>
    Math.abs(e.occurredAtMs - occurredAtMs) <= config.windowMs;

  // Two different references are two different transactions, whatever else they share.
  const near = sameAccount.filter(
    (e) => inWindow(e) && (reference === undefined || e.reference === undefined),
  );
  const authorizations = near.filter((e) => e.state === "pending" && e.isAuthorization);
  const onlyAuthorization = one(authorizations);
  if (onlyAuthorization !== undefined) {
    return { kind: "finalizesAuthorization", transactionId: onlyAuthorization.transactionId };
  }
  if (authorizations.length > 1) return { kind: "ambiguous", transactionIds: ids(authorizations) };

  const sameMinute = near.filter((e) => Math.abs(e.occurredAtMs - occurredAtMs) < MINUTE_MS);
  const onlySameMinute = one(sameMinute);
  if (onlySameMinute !== undefined && near.length === 1) {
    return { kind: "duplicate", transactionId: onlySameMinute.transactionId };
  }
  if (near.length > 0) return { kind: "ambiguous", transactionIds: ids(near) };

  const counterparts = same.filter(
    (e) => e.accountId !== accountId && e.direction !== direction && inWindow(e),
  );
  const onlyCounterpart = one(counterparts);
  if (onlyCounterpart !== undefined) {
    return { kind: "possibleCounterpart", transactionId: onlyCounterpart.transactionId };
  }
  if (counterparts.length > 1) return { kind: "ambiguous", transactionIds: ids(counterparts) };
  return { kind: "none" };
}
