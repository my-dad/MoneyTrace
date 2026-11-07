import { describe, expect, it } from "vitest";
import { Money } from "../money";
import { asAccountId } from "../ids";
import { LedgerDate } from "../ledger-date";
import { nominal, type AccountRef } from "./account-ref";
import { assertPostingAfterCutover } from "./cutover";
import type { EntryDraft } from "./entry";

const bdt = (n: number): Money => Money.ofMinor(n, "BDT");
const cash: AccountRef = { id: asAccountId("cash1"), kind: "cash", currency: "BDT" };
const bank: AccountRef = { id: asAccountId("bank1"), kind: "bank", currency: "BDT" };
const entries: EntryDraft[] = [
  { account: cash, side: "debit", amount: bdt(5) },
  { account: nominal.expense("food", "BDT"), side: "credit", amount: bdt(5) },
];
const at = (ms: number): LedgerDate => LedgerDate.fromEpochMs(ms);
const marker = (account: AccountRef, ms: number) => ({
  accountId: account.id,
  effectiveAt: at(ms),
});
const code = (c: string): Error => expect.objectContaining({ code: c }) as Error;

describe("assertPostingAfterCutover", () => {
  it("accepts a date strictly after the stored marker", () => {
    expect(() => {
      assertPostingAfterCutover(entries, at(101), [marker(cash, 100)], false);
    }).not.toThrow();
  });

  it.each([100, 99])("rejects a date of %i at or before the marker", (ms) => {
    expect(() => {
      assertPostingAfterCutover(entries, at(ms), [marker(cash, 100)], false);
    }).toThrow(code("beforeCutover"));
  });

  it("allows an account with no marker unless one is required", () => {
    expect(() => {
      assertPostingAfterCutover(entries, at(1), [marker(bank, 100)], false);
    }).not.toThrow();
    expect(() => {
      assertPostingAfterCutover(entries, at(1000), [marker(bank, 100)], true);
    }).toThrow(code("beforeCutover"));
  });

  it("ignores nominal accounts", () => {
    expect(() => {
      assertPostingAfterCutover(entries, at(101), [marker(cash, 100)], true);
    }).not.toThrow();
  });
});
