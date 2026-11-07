import { MONEY, dhakaMs, firstMatch, lastDigits, num, to24Hour, transaction } from "./shared";
import type { BankSmsParser } from "./shared";

const provider = "brac";
const ACCOUNT_AT = String.raw`A/C#\d*\*+(\d+) on (\d{2})-(\d{2})-(\d{2}) @(\d{2}):(\d{2}) (AM|PM)`;

function accountAt(m: RegExpMatchArray): number | null {
  return dhakaMs(num(m[5]), num(m[4]), num(m[3]), to24Hour(num(m[6]), m[8] ?? ""), num(m[7]));
}

export const bracParser: BankSmsParser = {
  name: provider,
  provider,
  version: "1",
  parse: (text) =>
    firstMatch(text, [
      [
        new RegExp(`^You have paid BDT (${MONEY}) as installment of .+?\\.`, "i"),
        (m) =>
          transaction(provider, {
            kind: "unclassifiedDebit",
            amount: m[1],
            currency: "BDT",
            occurredAtMs: null,
          }),
      ],
      [
        new RegExp(
          `^TK (${MONEY}) credited to ${ACCOUNT_AT} from .+?\\. Balance TK (${MONEY})\\.`,
          "i",
        ),
        (m) => {
          const at = accountAt(m);
          if (at === null) return null;
          return transaction(provider, {
            kind: "unclassifiedCredit",
            amount: m[1],
            balance: m[9],
            currency: "BDT",
            instrumentMask: lastDigits(m[2] ?? ""),
            occurredAtMs: at,
          });
        },
      ],
      [
        new RegExp(
          `^TK (${MONEY}) withdrawn from ${ACCOUNT_AT} from (.+?)\\. Balance TK (${MONEY})\\.`,
          "i",
        ),
        (m) => {
          const at = accountAt(m);
          if (at === null) return null;
          return transaction(provider, {
            kind: "withdrawal",
            amount: m[1],
            balance: m[10],
            counterparty: m[9] ?? "",
            currency: "BDT",
            instrumentMask: lastDigits(m[2] ?? ""),
            occurredAtMs: at,
          });
        },
      ],
      [
        new RegExp(
          `^BDT (${MONEY}) transacted at (.+?) on (\\d{2})/(\\d{2})/(\\d{2}) \\[(\\d{2}):(\\d{2}):(\\d{2}) (AM|PM) BST\\] using Card#\\*+(\\d+)\\.`,
          "i",
        ),
        (m) => {
          const at = dhakaMs(
            num(m[5]),
            num(m[4]),
            num(m[3]),
            to24Hour(num(m[6]), m[9] ?? ""),
            num(m[7]),
            num(m[8]),
          );
          if (at === null) return null;
          return transaction(provider, {
            kind: "cardTransaction",
            amount: m[1],
            counterparty: m[2] ?? "",
            currency: "BDT",
            instrumentMask: lastDigits(m[10] ?? ""),
            occurredAtMs: at,
          });
        },
      ],
      [
        new RegExp(
          `^BDT (${MONEY}) has been credited to your BRAC Bank Credit Card#\\*+(\\d+)\\.`,
          "i",
        ),
        (m) =>
          transaction(provider, {
            kind: "cardRepayment",
            amount: m[1],
            currency: "BDT",
            instrumentMask: lastDigits(m[2] ?? ""),
            occurredAtMs: null,
          }),
      ],
    ]),
};
