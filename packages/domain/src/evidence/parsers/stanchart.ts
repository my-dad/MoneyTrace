import { MONEY, dhakaMs, firstMatch, lastDigits, monthNumber, num, transaction } from "./shared";
import type { BankSmsParser } from "./shared";

const provider = "stanchart";

export const stanchartParser: BankSmsParser = {
  name: provider,
  provider,
  version: "1",
  parse: (text) =>
    firstMatch(text, [
      [
        new RegExp(
          `^Dear Client, BDT (${MONEY}) was deposited to Acc\\. ending x*(\\d+) on (\\d{2})-([A-Za-z]{3})-(\\d{2})\\. Available balance is now BDT (${MONEY})\\.`,
          "i",
        ),
        (m) => {
          const at = dhakaMs(num(m[5]), monthNumber(m[4] ?? ""), num(m[3]));
          if (at === null) return null;
          return transaction(provider, {
            kind: "unclassifiedCredit",
            amount: m[1],
            balance: m[6],
            currency: "BDT",
            instrumentMask: lastDigits(m[2] ?? ""),
            occurredAtMs: at,
            dateOnly: true,
          });
        },
      ],
    ]),
};
