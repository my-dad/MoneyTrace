import {
  MONEY,
  currencyOf,
  dhakaMs,
  firstMatch,
  lastDigits,
  num,
  to24Hour,
  transaction,
} from "./shared";
import type { BankSmsParser } from "./shared";

const provider = "ucb";

export const ucbParser: BankSmsParser = {
  name: provider,
  provider,
  version: "1",
  parse: (text) =>
    firstMatch(text, [
      [
        // These alerts carry a time but no date, so the date is left for the user to confirm.
        new RegExp(
          `^Your A/C \\(\\*+(\\d+)\\) has been (credited|debited) BDT (${MONEY}) for .+?\\. Avl Bal: BDT (${MONEY}) @ \\d{2}:\\d{2} (?:AM|PM)\\.`,
          "i",
        ),
        (m) =>
          transaction(provider, {
            kind: m[2]?.toLowerCase() === "credited" ? "unclassifiedCredit" : "unclassifiedDebit",
            amount: m[3],
            balance: m[4],
            currency: "BDT",
            instrumentMask: lastDigits(m[1] ?? ""),
            occurredAtMs: null,
          }),
      ],
      [
        new RegExp(
          `^Thank you for payment (\\$|BDT)\\s*(${MONEY}) through .+? against your UCB Card#\\s*(\\d+) \\(Client ID #\\s*\\d+\\) on (\\d{2})/(\\d{2})/(\\d{2}) (\\d{2}):(\\d{2}) (AM|PM)`,
          "i",
        ),
        (m) => {
          const at = dhakaMs(
            num(m[6]),
            num(m[5]),
            num(m[4]),
            to24Hour(num(m[7]), m[9] ?? ""),
            num(m[8]),
          );
          if (at === null) return null;
          return transaction(provider, {
            kind: "cardRepayment",
            amount: m[2],
            currency: currencyOf(m[1]),
            instrumentMask: lastDigits(m[3] ?? ""),
            occurredAtMs: at,
          });
        },
      ],
      [
        new RegExp(
          `^UCB Card#\\s*(\\d+)\\(ID#\\d+\\) charged at (.+?) for (BDT|\\$)\\s*(${MONEY}) on (\\d{2}):(\\d{2}) (\\d{2})\\.(\\d{2})\\.(\\d{2})\\.`,
          "i",
        ),
        (m) => {
          const at = dhakaMs(num(m[9]), num(m[8]), num(m[7]), num(m[5]), num(m[6]));
          if (at === null) return null;
          return transaction(provider, {
            kind: "cardTransaction",
            amount: m[4],
            currency: currencyOf(m[3]),
            counterparty: m[2] ?? "",
            instrumentMask: lastDigits(m[1] ?? ""),
            occurredAtMs: at,
          });
        },
      ],
      [
        new RegExp(
          `^Your UCB Debit Card#(\\d+) \\(CL ID:\\d+\\) has been charged for (BDT|\\$)\\s*(${MONEY}) at (.+?) on (\\d{2})/(\\d{2})/(\\d{2}) (\\d{2}):(\\d{2})\\. Avl Bal:(${MONEY})\\.`,
          "i",
        ),
        (m) => {
          const at = dhakaMs(num(m[7]), num(m[6]), num(m[5]), num(m[8]), num(m[9]));
          if (at === null) return null;
          return transaction(provider, {
            kind: "cardTransaction",
            amount: m[3],
            balance: m[10],
            currency: currencyOf(m[2]),
            counterparty: m[4] ?? "",
            instrumentMask: lastDigits(m[1] ?? ""),
            occurredAtMs: at,
          });
        },
      ],
    ]),
};
