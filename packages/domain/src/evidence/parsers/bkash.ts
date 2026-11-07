import { MONEY, dhakaMs, firstMatch, num, to24Hour, transaction } from "./shared";
import type { BankSmsParser } from "./shared";

const provider = "bkash";
const STAMP = String.raw`TrxID:? (\w+) at (\d{2})/(\d{2})/(\d{4}) (\d{2}):(\d{2})`;
const FEE_BALANCE = String.raw`Fee Tk\s*(${MONEY})\. Balance Tk\s*(${MONEY})\.`;

function stamp(m: RegExpMatchArray, from: number): { reference: string; at: number | null } {
  return {
    reference: m[from] ?? "",
    at: dhakaMs(
      num(m[from + 3]),
      num(m[from + 2]),
      num(m[from + 1]),
      num(m[from + 4]),
      num(m[from + 5]),
    ),
  };
}

/** Every kind of money arriving in the wallet has the same tail. */
const credit = (from: number) => (m: RegExpMatchArray) => {
  const { reference, at } = stamp(m, from);
  if (at === null) return null;
  return transaction(provider, {
    kind: "unclassifiedCredit",
    amount: m[1],
    fee: m[2],
    balance: m[3],
    currency: "BDT",
    occurredAtMs: at,
    reference,
  });
};

export const bkashParser: BankSmsParser = {
  name: provider,
  provider,
  version: "1",
  parse: (text) =>
    firstMatch(text, [
      [
        new RegExp(
          `^Bill successfully paid\\. Biller: (\\S+) Amount: Tk\\s*(${MONEY}) TrxID: (\\w+) at (\\d{2})/(\\d{2})/(\\d{2}) (\\d{2}):(\\d{2})(AM|PM)`,
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
            kind: "purchase",
            category: "bills",
            amount: m[2],
            counterparty: m[1] ?? "",
            currency: "BDT",
            occurredAtMs: at,
            reference: m[3] ?? "",
          });
        },
      ],
      [
        new RegExp(
          `^Card recharge is successful\\s+No: \\S+\\s+A/C: \\S+\\s+Amount: Tk\\s*(${MONEY})\\s+Fee: Tk\\s*(${MONEY})\\s+${STAMP}\\s+Org: (\\S+)`,
          "i",
        ),
        (m) => {
          const { reference, at } = stamp(m, 3);
          if (at === null) return null;
          return transaction(provider, {
            kind: "purchase",
            category: "bills",
            amount: m[1],
            fee: m[2],
            counterparty: m[9] ?? "",
            currency: "BDT",
            occurredAtMs: at,
            reference,
          });
        },
      ],
      [
        new RegExp(
          `^You have received deposit from iBanking of Tk\\s*(${MONEY}) from .+?\\. ${FEE_BALANCE} ${STAMP}`,
          "i",
        ),
        credit(4),
      ],
      [
        new RegExp(
          `^Cash In Tk\\s*(${MONEY}) from \\S+ successful\\. ${FEE_BALANCE} ${STAMP}`,
          "i",
        ),
        credit(4),
      ],
      [
        new RegExp(
          `^You have received Tk\\s*(${MONEY}) from \\S+\\.(?: Ref .+?\\.)? ${FEE_BALANCE} ${STAMP}`,
          "i",
        ),
        credit(4),
      ],
    ]),
};
