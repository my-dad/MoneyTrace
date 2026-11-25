import { describe, expect, it } from "vitest";
import { knownSector, normalizeMerchant } from "./merchants";

describe("normalizeMerchant", () => {
  it("gives one key for the same shop however the SMS spells it", () => {
    expect(normalizeMerchant("FOODPANDA BD DHAKA")?.key).toBe("foodpanda");
    expect(normalizeMerchant("Foodpanda")?.key).toBe("foodpanda");
    expect(normalizeMerchant("foodpanda ltd")?.key).toBe("foodpanda");
    expect(normalizeMerchant("FOODPANDA BANGLADESH LIMITED")?.key).toBe("foodpanda");
  });

  it("tidies the display name and keeps meaningful words", () => {
    expect(normalizeMerchant("  SHWAPNO   GULSHAN-2 ")).toEqual({ name: "Shwapno Gulshan-2", key: "shwapnogulshan2" });
    expect(normalizeMerchant("Foodpanda")?.name).toBe("Foodpanda");
  });

  it("drops trailing terminal numbers", () => {
    expect(normalizeMerchant("AGORA DHANMONDI 004512")?.key).toBe("agoradhanmondi");
  });

  it("returns null when nothing is left", () => {
    expect(normalizeMerchant("")).toBeNull();
    expect(normalizeMerchant("123456")).toBeNull();
    expect(normalizeMerchant("DHAKA BD")).toBeNull();
  });
});

describe("knownSector", () => {
  const of = (raw: string) => {
    const m = normalizeMerchant(raw);
    if (m === null) throw new Error(raw);
    return m;
  };

  it("sorts well-known merchants", () => {
    expect(knownSector(of("FOODPANDA BD DHAKA"))).toBe("food");
    expect(knownSector(of("PATHAO LTD"))).toBe("transport");
    expect(knownSector(of("PATHAO LTD"), "PATHAO FOOD order")).toBe("food");
    expect(knownSector(of("SHWAPNO GULSHAN-2"))).toBe("groceries");
    expect(knownSector(of("DARAZ"))).toBe("shopping");
    expect(knownSector(of("GRAMEENPHONE"))).toBe("bills");
    expect(knownSector(of("UBER BV"))).toBe("transport");
  });

  it("matches short names only as whole words, so they don't hide inside other names", () => {
    expect(knownSector(of("ACROBAT GYM"))).toBeNull();
    expect(knownSector(of("ROBINS BAKERY"))).toBeNull();
    expect(knownSector(of("ROBI AXIATA"))).toBe("bills");
    expect(knownSector(of("KFC GULSHAN"))).toBe("food");
  });

  it("leaves unknown merchants unsorted", () => {
    expect(knownSector(of("UNKNOWN SHOP"))).toBeNull();
  });
});
