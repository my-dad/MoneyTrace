import type { CandidateKind, CandidateTransaction } from "./candidate";

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
  /** What it was posted as; only a plain purchase or income can be the other half of a transfer. */
  intentType?: string;
};

export type MatchResult =
  | { kind: "none" }
  | { kind: "duplicate"; transactionId: string }
  | { kind: "ambiguous"; transactionIds: string[] }
  | { kind: "finalizesAuthorization"; transactionId: string }
  | { kind: "possibleCounterpart"; transactionId: string }
  /** The other half of the user's own transfer, unique and close in time (CR-008). */
  | { kind: "transferCounterpart"; transactionId: string; accountId: string };

export type MatchConfig = { windowMs: number; transferWindowMs: number };

/** Own transfers pair automatically within 30 minutes; further apart the same day, the user is asked (CR-008). */
export const DEFAULT_MATCH_CONFIG: MatchConfig = { windowMs: 600_000, transferWindowMs: 1_800_000 };

const PAIRABLE: ReadonlySet<string> = new Set(["purchase", "income"]);

/**
 * Only plain spending or income evidence can be the new half of a transfer. A withdrawal, fee,
 * refund or transfer already says what it is, and absorbing one would lose its own effects.
 */
const PAIRABLE_CANDIDATE: ReadonlySet<CandidateKind> = new Set<CandidateKind>([
  "purchase",
  "income",
  "cardTransaction",
  "cardPurchase",
  "unclassifiedCredit",
  "unclassifiedDebit",
]);

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The Dhaka calendar day (Bangladesh has no daylight saving). */
const dhakaDay = (ms: number): number => Math.floor((ms + DHAKA_OFFSET_MS) / DAY_MS);

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

  // Without a shared reference, nearness is never proof: date-only SMS share midnight, and two real
  // equal charges can share a minute. Ask instead of merging (gate 28). A re-pasted identical SMS
  // never gets here; intake's source hash already catches it.
  if (near.length > 0) return { kind: "ambiguous", transactionIds: ids(near) };

  // The other half of the user's own transfer: money out of one source and into another.
  if (!PAIRABLE_CANDIDATE.has(candidate.kind)) return { kind: "none" };
  const pairable = same.filter(
    (e) =>
      e.accountId !== accountId &&
      e.direction !== direction &&
      (e.intentType === undefined || PAIRABLE.has(e.intentType)),
  );
  const close = pairable.filter((e) => Math.abs(e.occurredAtMs - occurredAtMs) <= config.transferWindowMs);
  const onlyClose = one(close);
  if (onlyClose !== undefined) {
    return { kind: "transferCounterpart", transactionId: onlyClose.transactionId, accountId: onlyClose.accountId };
  }
  if (close.length > 1) return { kind: "ambiguous", transactionIds: ids(close) };
  // Further apart, only the same Dhaka calendar day is worth asking about.
  const counterparts = pairable.filter((e) => dhakaDay(e.occurredAtMs) === dhakaDay(occurredAtMs));
  const onlyCounterpart = one(counterparts);
  if (onlyCounterpart !== undefined) {
    return { kind: "possibleCounterpart", transactionId: onlyCounterpart.transactionId };
  }
  if (counterparts.length > 1) return { kind: "ambiguous", transactionIds: ids(counterparts) };
  return { kind: "none" };
}
