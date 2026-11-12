import type { CandidateTransaction } from "./candidate";
import { bkashParser } from "./parsers/bkash";
import { bracParser } from "./parsers/brac";
import { mtbParser } from "./parsers/mtb";
import { notFinancialParser } from "./parsers/not-financial";
import type { BankSmsParser, ParsedSms } from "./parsers/shared";
import { stanchartParser } from "./parsers/stanchart";
import { trustbankParser } from "./parsers/trustbank";
import { ucbParser } from "./parsers/ucb";
import { upayParser } from "./parsers/upay";

export { parseMoneyToMinor } from "./parsers/shared";
export type { BankSmsParser, ParsedSms } from "./parsers/shared";

export type ParserEvaluation =
  | { outcome: "match"; parser: { name: string; version: string }; parsed: ParsedSms }
  | {
      outcome: "conflict";
      parsers: string[];
      /** The one transaction reading among the disagreeing parsers (the rest say "not financial"), shown so the user can confirm it. */
      transaction?: { parser: { name: string; version: string }; candidate: CandidateTransaction; confidenceBp: number };
    }
  | { outcome: "none" };

export const defaultParsers: readonly BankSmsParser[] = [
  bkashParser,
  bracParser,
  mtbParser,
  stanchartParser,
  trustbankParser,
  ucbParser,
  upayParser,
  notFinancialParser,
];

const INCOMING: ReadonlySet<CandidateTransaction["kind"]> = new Set([
  "unclassifiedCredit",
  "income",
  "refund",
  "cardRepayment",
]);

/** What two readings must agree on: spec section 5 stage 3. */
function readingKey(parsed: ParsedSms): string {
  if (parsed.kind === "notFinancial") return "notFinancial";
  const c = parsed.candidate;
  return JSON.stringify([
    c.amountMinor,
    c.currency,
    c.instrumentMask ?? null,
    INCOMING.has(c.kind) ? "in" : "out",
  ]);
}

const confidenceOf = (parsed: ParsedSms): number =>
  parsed.kind === "transaction" ? parsed.confidenceBp : 0;

/** Every parser runs and registry order never decides. A parser that throws counts as no match. */
export function evaluateParsers(parsers: readonly BankSmsParser[], text: string): ParserEvaluation {
  const hits: { parser: BankSmsParser; parsed: ParsedSms }[] = [];
  for (const parser of parsers) {
    let parsed: ParsedSms | null = null;
    try {
      parsed = parser.parse(text);
    } catch {
      continue;
    }
    if (parsed !== null) hits.push({ parser, parsed });
  }
  const [first] = hits;
  if (first === undefined) return { outcome: "none" };
  if (hits.some((h) => readingKey(h.parsed) !== readingKey(first.parsed))) {
    const parsers = hits.map((h) => h.parser.name).sort();
    const readings = hits.filter((h) => h.parsed.kind === "transaction");
    const only = readings[0];
    if (only !== undefined && only.parsed.kind === "transaction" && readings.every((h) => readingKey(h.parsed) === readingKey(only.parsed))) {
      return {
        outcome: "conflict",
        parsers,
        transaction: { parser: { name: only.parser.name, version: only.parser.version }, candidate: only.parsed.candidate, confidenceBp: only.parsed.confidenceBp },
      };
    }
    return { outcome: "conflict", parsers };
  }
  const best = hits.reduce((a, b) => (confidenceOf(b.parsed) > confidenceOf(a.parsed) ? b : a));
  return {
    outcome: "match",
    parser: { name: best.parser.name, version: best.parser.version },
    parsed: best.parsed,
  };
}
