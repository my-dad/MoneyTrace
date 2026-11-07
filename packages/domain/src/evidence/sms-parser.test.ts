import { describe, expect, it } from "vitest";
import corpus from "../../../../fixtures/sms/corpus.json";
import type { CandidateTransaction } from "./candidate";
import { maskIdentifiers } from "./sensitive";
import {
  defaultParsers,
  evaluateParsers,
  parseMoneyToMinor,
  type BankSmsParser,
  type ParsedSms,
} from "./sms-parser";

type Entry = (typeof corpus)[number];

function expectedCandidate(entry: Entry): CandidateTransaction {
  const { occurredAtIso, ...rest } = entry.expected as Record<string, unknown> & {
    occurredAtIso: string | null;
  };
  return {
    ...rest,
    provider: entry.provider,
    occurredAtMs: occurredAtIso === null ? null : Date.parse(occurredAtIso),
  } as CandidateTransaction;
}

const byText = (needle: string): string => {
  const e = corpus.find((c) => c.text.includes(needle));
  if (e === undefined) throw new Error(`no corpus entry contains ${needle}`);
  return e.text;
};

const transaction = (candidate: Partial<CandidateTransaction>, confidenceBp = 9500): ParsedSms => ({
  kind: "transaction",
  confidenceBp,
  candidate: {
    kind: "purchase",
    amountMinor: 100,
    currency: "BDT",
    occurredAtMs: 1,
    ...candidate,
  },
});

const parserOf = (name: string, result: ParsedSms | null): BankSmsParser => ({
  name,
  provider: name,
  version: "1",
  parse: () => result,
});

describe("defaultParsers on the corpus", () => {
  it.each(corpus.map((e) => [e.text, e] as const))("reads exactly: %s", (text, entry) => {
    const r = evaluateParsers(defaultParsers, text);
    expect(r.outcome).toBe("match");
    if (r.outcome !== "match" || r.parsed.kind !== "transaction") throw new Error("no transaction");
    expect(r.parsed.candidate).toEqual(expectedCandidate(entry));
    expect(r.parser.name).toBe(entry.provider);
    expect(r.parsed.confidenceBp).toBeGreaterThan(0);
  });

  it.each(corpus.map((e) => [e.text, e] as const))(
    "reads the same after identifiers are masked: %s",
    (text, entry) => {
      const r = evaluateParsers(defaultParsers, maskIdentifiers(text));
      if (r.outcome !== "match" || r.parsed.kind !== "transaction") {
        throw new Error("no transaction");
      }
      expect(r.parsed.candidate).toEqual(expectedCandidate(entry));
    },
  );

  it("reads a Trust Bank withdrawal exactly, including a 3-digit mask", () => {
    const r = evaluateParsers(defaultParsers, byText("15000.00 DEBIT"));
    expect(r).toMatchObject({
      outcome: "match",
      parsed: {
        kind: "transaction",
        candidate: {
          kind: "withdrawal",
          amountMinor: 1500000,
          currency: "BDT",
          provider: "trustbank",
          instrumentMask: "111",
          occurredAtMs: Date.parse("2026-03-07T11:20:00Z"),
          balanceAfterMinor: 231025,
        },
      },
    });
  });

  it("keeps the amount separate from a fee", () => {
    expect(evaluateParsers(defaultParsers, byText("Fund Transfer"))).toMatchObject({
      parsed: { candidate: { amountMinor: 50000, feeMinor: 500, destinationMask: "3333" } },
    });
  });

  it("a zero fee is left out", () => {
    const r = evaluateParsers(defaultParsers, byText("Cash In"));
    if (r.outcome !== "match" || r.parsed.kind !== "transaction") throw new Error("no transaction");
    expect(r.parsed.candidate).not.toHaveProperty("feeMinor");
  });

  it("never reads a phone number or an ID as an amount", () => {
    expect(evaluateParsers(defaultParsers, byText("Mobile recharge"))).toMatchObject({
      parsed: { candidate: { amountMinor: 5000 } },
    });
  });

  it("keeps a foreign currency rather than converting, even with BDT balances in the text", () => {
    expect(evaluateParsers(defaultParsers, byText("EXAMPLECLOUD"))).toMatchObject({
      parsed: { candidate: { amountMinor: 1200, currency: "USD" } },
    });
    expect(evaluateParsers(defaultParsers, byText("UCB One"))).toMatchObject({
      parsed: { candidate: { amountMinor: 2000, currency: "USD" } },
    });
  });

  it("an SMS with no date gives occurredAtMs null", () => {
    expect(evaluateParsers(defaultParsers, byText("I BANKING FUND"))).toMatchObject({
      parsed: { candidate: { occurredAtMs: null } },
    });
  });

  it("a date alone means the start of that day in Dhaka", () => {
    expect(evaluateParsers(defaultParsers, byText("was deposited"))).toMatchObject({
      parsed: {
        candidate: { occurredAtMs: Date.parse("2026-03-13T18:00:00Z"), dateOnly: true },
      },
    });
  });

  it("an impossible date is not a match", () => {
    const text = byText("EXAMPLE PHARMA").replace("28/03/26", "31/02/26");
    expect(evaluateParsers(defaultParsers, text).outcome).toBe("none");
  });

  it.each([
    ["Your card transaction of BDT 500.00 at EXAMPLE STORE was declined.", "declined"],
    ["Transaction failed. Tk 200.00 was not deducted.", "declined"],
    ["Your payment of Tk 300.00 was unsuccessful. Please try again.", "declined"],
    ["Enjoy 20% cashback on your next purchase. T&C apply.", "promotional"],
    ["Special offer: get BDT 100 discount on recharge today!", "promotional"],
    ["Your available balance is BDT 1,200.00.", "balanceOnly"],
  ])("does not treat %s as money moving", (text, reason) => {
    expect(evaluateParsers(defaultParsers, text)).toMatchObject({
      outcome: "match",
      parsed: { kind: "notFinancial", reason },
    });
  });

  it("does not recognize a cash note", () => {
    expect(evaluateParsers(defaultParsers, "spent 500 on rickshaw").outcome).toBe("none");
  });
});

describe("evaluateParsers", () => {
  it("returns none when nothing applies", () => {
    expect(evaluateParsers([parserOf("a", null)], "x")).toEqual({ outcome: "none" });
  });

  it.each([
    ["amount", { amountMinor: 200 }],
    ["currency", { currency: "USD" }],
    ["account", { instrumentMask: "9999" }],
    ["direction", { kind: "unclassifiedCredit" as const }],
  ])("registry order never decides when parsers disagree on %s", (_field, change) => {
    const a = parserOf("a", transaction({ instrumentMask: "1111" }, 9900));
    const b = parserOf("b", transaction({ instrumentMask: "1111", ...change }, 100));
    for (const parsers of [
      [a, b],
      [b, a],
    ]) {
      expect(evaluateParsers(parsers, "x")).toEqual({ outcome: "conflict", parsers: ["a", "b"] });
    }
  });

  it("agreeing parsers match, and the highest confidence result is used in any order", () => {
    const a = parserOf("a", transaction({}, 5000));
    const b = parserOf("b", transaction({ counterparty: "Shop" }, 9000));
    for (const parsers of [
      [a, b],
      [b, a],
    ]) {
      expect(evaluateParsers(parsers, "x")).toMatchObject({
        outcome: "match",
        parser: { name: "b" },
      });
    }
  });

  it("a transaction and a not-financial reading conflict", () => {
    const a = parserOf("a", transaction({}));
    const b = parserOf("b", { kind: "notFinancial", reason: "declined" });
    expect(evaluateParsers([a, b], "x").outcome).toBe("conflict");
  });

  it("a parser that throws counts as no match and does not break the others", () => {
    const bad: BankSmsParser = {
      name: "bad",
      provider: "bad",
      version: "1",
      parse: () => {
        throw new Error("boom");
      },
    };
    expect(evaluateParsers([bad, parserOf("a", transaction({}))], "x")).toMatchObject({
      outcome: "match",
      parser: { name: "a" },
    });
  });

  it("every parser has a name, provider and version", () => {
    for (const p of defaultParsers) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.provider.length).toBeGreaterThan(0);
      expect(p.version.length).toBeGreaterThan(0);
    }
  });
});

describe("parseMoneyToMinor", () => {
  it.each([
    ["5,000.00", 500000],
    ["1,25,000", 12500000],
    ["৳1,850", 185000],
    ["Tk.500.5", 50050],
    ["0.01", 1],
    ["BDT376.46", 37646],
    ["Tk. 1000.00", 100000],
    ["60,000.5", 6000050],
    ["$ 9.99", 999],
    ["19.99", 1999],
    ["1.10", 110],
  ])("parses %s to %i", (s, n) => {
    expect(parseMoneyToMinor(s)).toBe(n);
  });

  it.each(["12.345", "1.2.3", "abc", "", "99999999999999999", "-5", "5,00x"])("refuses %s", (s) => {
    expect(parseMoneyToMinor(s)).toBeNull();
  });
});
