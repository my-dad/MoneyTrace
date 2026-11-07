import type { BankSmsParser, ParsedSms } from "./shared";

const DECLINED = /\b(?:declined|failed|unsuccessful|could not be processed)\b/i;
const PROMOTIONAL = /\b(?:cashback|cash back|offer|discount|promo|campaign|t&c)\b|\d+%\s*off/i;
const BALANCE = /\b(?:available|current|avl)\s+(?:balance|bal)\b/i;
const MONEY_MOVED =
  /\b(?:debit|debited|credit|credited|withdrawn|deposited|purchase|charged|paid|received|transacted|transfer|recharge)\b/i;

function classify(text: string): ParsedSms | null {
  if (DECLINED.test(text)) return { kind: "notFinancial", reason: "declined" };
  if (PROMOTIONAL.test(text)) return { kind: "notFinancial", reason: "promotional" };
  if (BALANCE.test(text) && !MONEY_MOVED.test(text)) {
    return { kind: "notFinancial", reason: "balanceOnly" };
  }
  return null;
}

/** Messages that look financial but moved no money, in any provider's wording. */
export const notFinancialParser: BankSmsParser = {
  name: "not-financial",
  provider: "generic",
  version: "1",
  parse: classify,
};
