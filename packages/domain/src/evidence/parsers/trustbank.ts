import { MONEY, dhakaMs, firstMatch, lastDigits, num, to24Hour, transaction } from "./shared";
import type { BankSmsParser } from "./shared";

const provider = "trustbank";

export const trustbankParser: BankSmsParser = {
  name: provider,
  provider,
  version: "1",
  parse: (text) =>
    firstMatch(text, [
      [
        new RegExp(
          `^ATM CASH Txn\\s+TK\\s+(${MONEY})\\s+(DEBIT|CREDIT)\\s+AC No\\s+\\d*\\*+(\\d+)\\s+(\\d{2})/(\\d{2})/(\\d{4})\\s+(\\d{2}):(\\d{2})\\s+(AM|PM)\\s+Balance TK\\s+(${MONEY})`,
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
            kind: m[2]?.toUpperCase() === "DEBIT" ? "withdrawal" : "unclassifiedCredit",
            amount: m[1],
            balance: m[10],
            currency: "BDT",
            instrumentMask: lastDigits(m[3] ?? ""),
            occurredAtMs: at,
          });
        },
      ],
    ]),
};
