import type { TipFact } from "@moneytrace/contracts";
import { describe, expect, it } from "vitest";
import { validateAdvice } from "./validate-advice";

const food: TipFact = { id: "sectorUp:food", kind: "sectorUp", sector: "food", amountMinor: 294000, compareMinor: 213000, headline: "Food is up on last month", detail: "৳2,940 by 6 Nov, against ৳2,130 by this time in October" };
const cash: TipFact = { id: "unexplainedCash", kind: "unexplainedCash", amountMinor: 500000, headline: "৳5,000 cash isn't explained yet", detail: "Counting your cash keeps the picture right" };

const one = (advice: string, fact: TipFact = food) => validateAdvice({ tips: [{ factId: fact.id, advice }] }, [food, cash])[fact.id];

describe("validateAdvice", () => {
  it("keeps plain gentle advice, trimmed", () => {
    expect(one("  Ate out less? Try cooking at home.  ")).toBe("Ate out less? Try cooking at home.");
  });

  it("drops advice for a fact we did not send", () => {
    expect(validateAdvice({ tips: [{ factId: "topSector:rent", advice: "Fine." }] }, [food])).toEqual({});
  });

  it("keeps the first advice when a fact repeats", () => {
    expect(validateAdvice({ tips: [{ factId: food.id, advice: "First." }, { factId: food.id, advice: "Second." }] }, [food])).toEqual({ [food.id]: "First." });
  });

  it("drops advice over 200 characters", () => {
    expect(one(`${"a".repeat(199)}.`)).toBeDefined();
    expect(one(`${"a".repeat(200)}.`)).toBeUndefined();
  });

  it("drops empty advice and more than two sentences", () => {
    expect(one("   ")).toBeUndefined();
    expect(one("Plan meals. Shop once. Cook more.")).toBeUndefined();
  });

  it.each([
    ["digits", "Save 500 a week."],
    ["the taka sign", "Keep ৳ aside for treats."],
    ["Bangla digits", "Try ৫ fewer trips."],
    ["number words", "Spend about five thousand less."],
    ["lakh", "Half a lakh is a lot."],
    ["taka", "Put aside a few taka."],
    ["Tk", "Keep Tk aside."],
    ["percent", "Cut it by ten percent."],
  ])("drops advice that states an amount (%s)", (_name, advice) => {
    expect(one(advice)).toBeUndefined();
  });

  it("drops advice that says unexplained cash was spent", () => {
    expect(one("Count it so you know where it was spent.", cash)).toBeUndefined();
    expect(one("Some of it may be lost in a drawer.", cash)).toBeUndefined();
    expect(one("A quick count keeps your records honest.", cash)).toBe("A quick count keeps your records honest.");
  });

  it("allows the word spend on other facts", () => {
    expect(one("Plan what you spend on snacks.")).toBe("Plan what you spend on snacks.");
  });
});
