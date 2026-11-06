import { describe, expect, it } from "vitest";
import { assertTransition, type TransactionState } from "./transaction";

const STATES: TransactionState[] = ["pending", "posted", "rejected", "reversed"];
const ALLOWED = new Set([
  "null>pending",
  "null>posted",
  "pending>posted",
  "pending>rejected",
  "posted>reversed",
]);
const pairs = ([null, ...STATES] as (TransactionState | null)[]).flatMap((from) =>
  STATES.map((to) => ({ from, to, ok: ALLOWED.has(`${from ?? "null"}>${to}`) })),
);

describe("assertTransition", () => {
  it.each(pairs.filter((p) => p.ok))("allows $from -> $to", ({ from, to }) => {
    expect(() => {
      assertTransition(from, to);
    }).not.toThrow();
  });

  it.each(pairs.filter((p) => !p.ok))(
    "rejects $from -> $to with invalidTransition",
    ({ from, to }) => {
      expect(() => {
        assertTransition(from, to);
      }).toThrow(expect.objectContaining({ code: "invalidTransition" }) as Error);
    },
  );
});
