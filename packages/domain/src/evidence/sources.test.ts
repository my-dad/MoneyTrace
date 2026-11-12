import { describe, expect, it } from "vitest";
import { isWalletProvider, providerSlug, sourceLabel } from "./sources";

describe("providerSlug", () => {
  it.each([
    ["BRAC Bank", "brac"],
    ["bKash", "bkash"],
    ["Nagad", "nagad"],
    ["Standard Chartered", "stanchart"],
    ["Trust Bank", "trustbank"],
    ["City Bank", "city-bank"],
    ["Cash", "cash"],
  ])("%s → %s", (name, slug) => {
    expect(providerSlug(name)).toBe(slug);
  });

  it("refuses a name with nothing usable", () => {
    expect(providerSlug("  !!  ")).toBeNull();
  });
});

describe("sourceLabel", () => {
  it("names wallets, cards and accounts the way the chips show them", () => {
    expect(sourceLabel("bkash", undefined, "transfer")).toBe("bKash");
    expect(sourceLabel("mtb", "2222", "cardTransaction")).toBe("MTB card ••2222");
    expect(sourceLabel("brac", "8888", "withdrawal")).toBe("BRAC ••8888");
    expect(sourceLabel("city-bank", undefined, "income")).toBe("City Bank");
    expect(isWalletProvider("upay")).toBe(true);
    expect(isWalletProvider("brac")).toBe(false);
  });
});
