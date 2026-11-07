import type { CandidateTransaction } from "../candidate";

export type ParsedSms =
  | { kind: "transaction"; candidate: CandidateTransaction; confidenceBp: number }
  | { kind: "notFinancial"; reason: "declined" | "promotional" | "balanceOnly" };

export type BankSmsParser = {
  name: string;
  provider: string;
  version: string;
  parse(text: string): ParsedSms | null;
};

/** One regex fragment for an amount as banks write it, with or without grouping commas. */
export const MONEY = String.raw`\d[\d,]*(?:\.\d+)?`;

export const FORMAT_CONFIDENCE_BP = 9500;

const CURRENCY_PREFIX = /^(?:৳|tk\.?|bdt|usd|\$)\s*/i;
const AMOUNT = /^\d+(?:\.\d{1,2})?$/;
const MAX_WHOLE_DIGITS = 13;

/** Parses by digits only, so no amount ever passes through a float. */
export function parseMoneyToMinor(text: string): number | null {
  const bare = text.trim().replace(CURRENCY_PREFIX, "").replace(/,/g, "");
  if (!AMOUNT.test(bare)) return null;
  const [whole = "", fraction = ""] = bare.split(".");
  if (whole.replace(/^0+/, "").length > MAX_WHOLE_DIGITS) return null;
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export const monthNumber = (name: string): number => MONTHS.indexOf(name.toLowerCase()) + 1;

/** Two-digit years are this century. Returns null for a date that does not exist. */
export function dhakaMs(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number | null {
  const fullYear = year < 100 ? 2000 + year : year;
  const utc = Date.UTC(fullYear, month - 1, day, hour, minute, second);
  const d = new Date(utc);
  if (
    d.getUTCFullYear() !== fullYear ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }
  return utc - DHAKA_OFFSET_MS;
}

export function to24Hour(hour: number, meridiem: string): number {
  const pm = meridiem.toLowerCase() === "pm";
  if (hour === 12) return pm ? 12 : 0;
  return pm ? hour + 12 : hour;
}

export const lastDigits = (digits: string, count = 4): string => digits.slice(-count);

export const num = (s: string | undefined): number => Number(s);

/** Builds a transaction result, or null if an amount in it does not parse. */
export function transaction(
  provider: string,
  fields: Omit<
    CandidateTransaction,
    "amountMinor" | "feeMinor" | "balanceAfterMinor" | "provider"
  > & {
    amount: string | undefined;
    fee?: string | undefined;
    balance?: string | undefined;
  },
): ParsedSms | null {
  const { amount, fee, balance, ...rest } = fields;
  const amountMinor = parseMoneyToMinor(amount ?? "");
  if (amountMinor === null || amountMinor === 0) return null;
  const feeMinor = fee === undefined ? 0 : parseMoneyToMinor(fee);
  const balanceAfterMinor = balance === undefined ? null : parseMoneyToMinor(balance);
  if (feeMinor === null) return null;
  return {
    kind: "transaction",
    confidenceBp: FORMAT_CONFIDENCE_BP,
    candidate: {
      ...rest,
      provider,
      amountMinor,
      ...(feeMinor > 0 ? { feeMinor } : {}),
      ...(balanceAfterMinor !== null ? { balanceAfterMinor } : {}),
    },
  };
}

export const currencyOf = (symbol: string | undefined): string => (symbol === "$" ? "USD" : "BDT");

/** Tries each format in turn. A format whose date does not exist yields no match. */
export function firstMatch(
  text: string,
  formats: readonly (readonly [RegExp, (m: RegExpMatchArray) => ParsedSms | null])[],
): ParsedSms | null {
  for (const [pattern, build] of formats) {
    const m = text.match(pattern);
    if (m !== null) return build(m);
  }
  return null;
}
