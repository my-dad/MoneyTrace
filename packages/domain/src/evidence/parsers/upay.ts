import { MONEY, dhakaMs, firstMatch, num, lastDigits, transaction } from "./shared";
import type { BankSmsParser } from "./shared";

const provider = "upay";
const STAMP = String.raw`TrxID (\w+) at (\d{2})/(\d{2})/(\d{4}) (\d{2}):(\d{2})`;

/** The reference and time are always the last six groups of a format. */
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

export const upayParser: BankSmsParser = {
  name: provider,
  provider,
  version: "1",
  parse: (text) =>
    firstMatch(text, [
      [
        new RegExp(
          `^Tk\\.\\s*(${MONEY}) has been received from .+?\\. Balance Tk\\.\\s*(${MONEY})\\. ${STAMP}`,
          "i",
        ),
        (m) => {
          const { reference, at } = stamp(m, 3);
          if (at === null) return null;
          return transaction(provider, {
            kind: "unclassifiedCredit",
            amount: m[1],
            balance: m[2],
            currency: "BDT",
            occurredAtMs: at,
            reference,
          });
        },
      ],
      [
        new RegExp(
          `^Mobile recharge of Tk\\.\\s*(${MONEY})\\.? for \\S+ is successful\\. Balance Tk\\.?\\s*(${MONEY})\\. ${STAMP}`,
          "i",
        ),
        (m) => {
          const { reference, at } = stamp(m, 3);
          if (at === null) return null;
          return transaction(provider, {
            kind: "purchase",
            category: "mobile-recharge",
            amount: m[1],
            balance: m[2],
            currency: "BDT",
            occurredAtMs: at,
            reference,
          });
        },
      ],
      [
        new RegExp(
          `^Fund Transfer Successful Tk\\.\\s*(${MONEY}) from \\S+ to .+? \\*+(\\d+)\\. Charge Tk\\.\\s*(${MONEY}) Balance Tk\\.\\s*(${MONEY})\\. ${STAMP}`,
          "i",
        ),
        (m) => {
          const { reference, at } = stamp(m, 5);
          if (at === null) return null;
          return transaction(provider, {
            kind: "transfer",
            amount: m[1],
            fee: m[3],
            balance: m[4],
            currency: "BDT",
            destinationMask: lastDigits(m[2] ?? ""),
            occurredAtMs: at,
            reference,
          });
        },
      ],
    ]),
};
