import { describe, expect, it } from "vitest";
import type { CandidateTransaction } from "./candidate";
import { DEFAULT_MATCH_CONFIG, matchCandidate, type ExistingTransaction } from "./matching";

const T = 1_700_000_000_000;
const MIN = 60_000;
const config = DEFAULT_MATCH_CONFIG;

const candidate = (over: Partial<CandidateTransaction> = {}): CandidateTransaction => ({
  kind: "purchase",
  amountMinor: 50000,
  currency: "BDT",
  occurredAtMs: T,
  ...over,
});

const existing = (over: Partial<ExistingTransaction> = {}): ExistingTransaction => ({
  transactionId: "t1",
  state: "posted",
  accountId: "bank",
  direction: "out",
  amountMinor: 50000,
  currency: "BDT",
  occurredAtMs: T,
  isAuthorization: false,
  ...over,
});

const match = (c: CandidateTransaction, rows: ExistingTransaction[]) =>
  matchCandidate(c, "bank", "out", rows, config);

describe("matchCandidate", () => {
  it("nothing to compare is none", () => {
    expect(match(candidate(), [])).toEqual({ kind: "none" });
  });
  it("gate 28: equal purchases with different references stay separate", () => {
    expect(match(candidate({ reference: "A" }), [existing({ reference: "B" })])).toEqual({
      kind: "none",
    });
  });
  it("gate 28: equal purchases an hour apart stay separate", () => {
    expect(match(candidate(), [existing({ occurredAtMs: T + 60 * MIN })])).toEqual({
      kind: "none",
    });
  });
  it("the same reference is a duplicate even across the window", () => {
    expect(
      match(candidate({ reference: "A" }), [
        existing({ reference: "A", occurredAtMs: T + 90 * MIN }),
      ]),
    ).toEqual({ kind: "duplicate", transactionId: "t1" });
  });
  it("gate 28: the identical minute with no shared reference asks rather than merges", () => {
    expect(match(candidate(), [existing({ occurredAtMs: T + 20_000 })])).toEqual({
      kind: "ambiguous",
      transactionIds: ["t1"],
    });
  });
  it("gate 28: two date-only debits of the same amount on the same day ask rather than merge", () => {
    expect(match(candidate({ dateOnly: true }), [existing({ occurredAtMs: T })])).toEqual({
      kind: "ambiguous",
      transactionIds: ["t1"],
    });
  });
  it("two equal purchases minutes apart with no reference ask rather than merge", () => {
    expect(match(candidate(), [existing({ occurredAtMs: T + 5 * MIN })])).toEqual({
      kind: "ambiguous",
      transactionIds: ["t1"],
    });
  });
  it("several possible duplicates at the same minute ask rather than pick one", () => {
    expect(match(candidate(), [existing(), existing({ transactionId: "t2" })])).toEqual({
      kind: "ambiguous",
      transactionIds: ["t1", "t2"],
    });
  });
  it("a final posting finalizes a unique pending authorization, counted once", () => {
    expect(
      match(candidate(), [
        existing({ state: "pending", isAuthorization: true, occurredAtMs: T - 5 * MIN }),
      ]),
    ).toEqual({ kind: "finalizesAuthorization", transactionId: "t1" });
  });
  it("two pending authorizations of the same amount ask", () => {
    const pending = { state: "pending", isAuthorization: true, occurredAtMs: T - 5 * MIN } as const;
    expect(
      match(candidate(), [existing(pending), existing({ ...pending, transactionId: "t2" })]),
    ).toEqual({ kind: "ambiguous", transactionIds: ["t1", "t2"] });
  });
  it("another currency never matches", () => {
    expect(match(candidate(), [existing({ currency: "USD" })])).toEqual({ kind: "none" });
  });
  it("another amount never matches", () => {
    expect(match(candidate(), [existing({ amountMinor: 50001 })])).toEqual({ kind: "none" });
  });
  it("a debit and a same-amount credit on two own accounts 5 minutes apart pair as a transfer", () => {
    expect(
      match(candidate({ kind: "unclassifiedDebit" }), [
        existing({ accountId: "card", direction: "in", occurredAtMs: T + 5 * MIN }),
      ]),
    ).toEqual({ kind: "transferCounterpart", transactionId: "t1", accountId: "card" });
  });
  it("same direction on another account is unrelated", () => {
    expect(match(candidate(), [existing({ accountId: "other" })])).toEqual({ kind: "none" });
  });
  it("an opposite entry an hour apart the same day asks", () => {
    expect(
      match(candidate(), [
        existing({ accountId: "card", direction: "in", occurredAtMs: T + 60 * MIN }),
      ]),
    ).toEqual({ kind: "possibleCounterpart", transactionId: "t1" });
  });
  it("two possible counterparts ask rather than pick one", () => {
    const other = { accountId: "card", direction: "in" } as const;
    expect(
      match(candidate(), [existing(other), existing({ ...other, transactionId: "t2" })]),
    ).toEqual({ kind: "ambiguous", transactionIds: ["t1", "t2"] });
  });
  it("a candidate with no date compares against nothing by time", () => {
    expect(match(candidate({ occurredAtMs: null }), [existing()])).toEqual({ kind: "none" });
  });

  describe("own transfers (CR-008)", () => {
    const other = (patch: Partial<ExistingTransaction>) =>
      existing({ accountId: "wallet", direction: "in", intentType: "income", ...patch });
    it("one opposite entry on another source within 30 minutes is the other half of a transfer", () => {
      expect(match(candidate(), [other({ occurredAtMs: T + 25 * MIN })])).toEqual({
        kind: "transferCounterpart",
        transactionId: "t1",
        accountId: "wallet",
      });
    });
    it("the same day but more than 30 minutes apart asks", () => {
      expect(match(candidate(), [other({ occurredAtMs: T + 31 * MIN })])).toEqual({ kind: "possibleCounterpart", transactionId: "t1" });
    });
    it("two possible other halves ask", () => {
      expect(match(candidate(), [other({ occurredAtMs: T + 5 * MIN }), other({ transactionId: "t2", occurredAtMs: T + 6 * MIN })])).toMatchObject({ kind: "ambiguous" });
    });
    it("an entry that is already a transfer is never paired again", () => {
      expect(match(candidate(), [other({ occurredAtMs: T + 5 * MIN, intentType: "transfer" })])).toEqual({ kind: "none" });
    });
  });

  it("a withdrawal, fee, refund or transfer is never the new half of a transfer (CR-008)", () => {
    const income = existing({ accountId: "wallet", direction: "in", intentType: "income", occurredAtMs: T + 5 * MIN });
    for (const kind of ["withdrawal", "fee", "refund", "transfer"] as const) {
      expect(match(candidate({ kind }), [income]).kind, kind).not.toBe("transferCounterpart");
    }
  });
});
