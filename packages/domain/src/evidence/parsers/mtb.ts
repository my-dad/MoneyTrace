import {
  MONEY,
  currencyOf,
  dhakaMs,
  firstMatch,
  lastDigits,
  monthNumber,
  num,
  to24Hour,
  transaction,
} from "./shared";
import type { BankSmsParser } from "./shared";

const provider = "mtb";
const AT = String.raw`on (\d{2})-([A-Za-z]{3})-(\d{2}) at (\d{2}):(\d{2}) (am|pm)`;

function at(m: RegExpMatchArray, from: number): number | null {
  return dhakaMs(
    num(m[from + 2]),
    monthNumber(m[from + 1] ?? ""),
    num(m[from]),
    to24Hour(num(m[from + 3]), m[from + 5] ?? ""),
    num(m[from + 4]),
  );
}

export const mtbParser: BankSmsParser = {
  name: provider,
  provider,
  version: "1",
  parse: (text) =>
    firstMatch(text, [
      [
        new RegExp(
          `^Dear Customer, Your A/C X*(\\d+) has been (Credited|Debited) by BDT (${MONEY}) on (\\d{2})/(\\d{2})/(\\d{2})\\. Available Balance BDT (${MONEY})\\.`,
          "i",
        ),
        (m) => {
          const when = dhakaMs(num(m[6]), num(m[5]), num(m[4]));
          if (when === null) return null;
          return transaction(provider, {
            kind: m[2]?.toLowerCase() === "credited" ? "unclassifiedCredit" : "unclassifiedDebit",
            amount: m[3],
            balance: m[7],
            currency: "BDT",
            instrumentMask: lastDigits(m[1] ?? ""),
            occurredAtMs: when,
            dateOnly: true,
          });
        },
      ],
      [
        new RegExp(
          `^Successful purchase transaction of (BDT|\\$)\\s*(${MONEY}) from\\s+(.+?) by MTB card-\\s*\\d+\\*+(\\d+) ${AT}\\.`,
          "i",
        ),
        (m) => {
          const when = at(m, 5);
          if (when === null) return null;
          return transaction(provider, {
            kind: "cardTransaction",
            amount: m[2],
            currency: currencyOf(m[1]),
            counterparty: m[3] ?? "",
            instrumentMask: lastDigits(m[4] ?? ""),
            occurredAtMs: when,
          });
        },
      ],
      [
        new RegExp(`^Payment of BDT (${MONEY}) credited to Card-\\s*\\d+\\*+(\\d+) ${AT}\\.`, "i"),
        (m) => {
          const when = at(m, 3);
          if (when === null) return null;
          return transaction(provider, {
            kind: "cardRepayment",
            amount: m[1],
            currency: "BDT",
            instrumentMask: lastDigits(m[2] ?? ""),
            occurredAtMs: when,
          });
        },
      ],
    ]),
};
