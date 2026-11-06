import { describe, expect, it } from "vitest";
import { Money } from "../money";
import { asAccountId } from "../ids";
import { nominal, isRealAccount, type AccountRef } from "./account-ref";
import { assertBalanced, reverseEntries, type EntryDraft } from "./entry";

const bdt = (n: number): Money => Money.ofMinor(n, "BDT");
const code = (c: string): unknown => expect.objectContaining({ code: c });
const bank: AccountRef = { id: asAccountId("bank1"), kind: "bank", currency: "BDT" };
const cash: AccountRef = { id: asAccountId("cash1"), kind: "cash", currency: "BDT" };
const e = (account: AccountRef, side: "debit" | "credit", n: number): EntryDraft => ({
  account,
  side,
  amount: bdt(n),
});

describe("nominal accounts", () => {
  it("builds the specified ids and kinds", () => {
    expect(nominal.expense("groceries", "BDT")).toEqual({
      id: "nominal:expense:groceries:BDT",
      kind: "expense",
      currency: "BDT",
    });
    expect(nominal.income("salary", "BDT").id).toBe("nominal:income:salary:BDT");
    expect(nominal.openingEquity("BDT").id).toBe("nominal:equity:opening:BDT");
    expect(nominal.adjustmentEquity("BDT").id).toBe("nominal:equity:adjustment:BDT");
  });

  it.each(["Groceries", "a_b", "", "-a", "a-", "a--b", "a b"])("rejects category %j", (c) => {
    expect(() => nominal.expense(c, "BDT")).toThrow(code("accountInvalid"));
  });

  it("isRealAccount distinguishes real from nominal kinds", () => {
    expect(isRealAccount(bank)).toBe(true);
    expect(isRealAccount({ ...bank, kind: "familyCash" })).toBe(true);
    expect(isRealAccount({ ...bank, kind: "creditLiability" })).toBe(true);
    expect(isRealAccount(nominal.expense("x", "BDT"))).toBe(false);
    expect(isRealAccount(nominal.openingEquity("BDT"))).toBe(false);
  });
});

describe("assertBalanced", () => {
  it("accepts balanced entries", () => {
    expect(() => {
      assertBalanced([e(cash, "debit", 5), e(bank, "credit", 5)]);
    }).not.toThrow();
    expect(() => {
      assertBalanced([e(cash, "debit", 3), e(cash, "debit", 2), e(bank, "credit", 5)]);
    }).not.toThrow();
  });

  it.each([
    ["empty", []],
    ["a single entry", [e(bank, "debit", 5)]],
    ["debits not equal to credits", [e(cash, "debit", 5), e(bank, "credit", 4)]],
    ["a zero amount", [e(cash, "debit", 0), e(bank, "credit", 0)]],
    ["a negative amount", [e(cash, "debit", -5), e(bank, "credit", -5)]],
  ])("throws unbalancedEntries for %s", (_n, entries) => {
    expect(() => {
      assertBalanced(entries);
    }).toThrow(code("unbalancedEntries"));
  });

  it("throws on mixed currency", () => {
    const usd = { ...bank, currency: "USD" } as unknown as AccountRef;
    const usdMoney = Money.ofMinor(5, "USD" as unknown as "BDT");
    expect(() => {
      assertBalanced([e(cash, "debit", 5), { account: usd, side: "credit", amount: usdMoney }]);
    }).toThrow(code("unbalancedEntries"));
  });

  it("throws when an account currency differs from its amount's", () => {
    const usd = { ...bank, currency: "USD" } as unknown as AccountRef;
    expect(() => {
      assertBalanced([e(cash, "debit", 5), e(usd, "credit", 5)]);
    }).toThrow(code("unbalancedEntries"));
  });
});

describe("reverseEntries", () => {
  it("flips every side and keeps amounts", () => {
    const rev = reverseEntries([e(cash, "debit", 5), e(bank, "credit", 5)]);
    expect(rev.map((x) => [x.account.id, x.side, x.amount.minor])).toEqual([
      ["cash1", "credit", 5],
      ["bank1", "debit", 5],
    ]);
  });
});
