import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Money, type CurrencyCode } from "./money";

const bdt = (n: number): Money => Money.ofMinor(n, "BDT");
const code = (c: string): unknown => expect.objectContaining({ code: c });

describe("Money", () => {
  it.each([12.5, NaN, Infinity, 2 ** 53])("rejects non-safe-integer minor %s", (v) => {
    expect(() => Money.ofMinor(v, "BDT")).toThrow(code("invalidMoney"));
  });

  it("rejects a string minor at runtime", () => {
    expect(() => Money.ofMinor("100" as unknown as number, "BDT")).toThrow(code("invalidMoney"));
  });

  it("throws when addition leaves the safe integer range", () => {
    expect(() => bdt(Number.MAX_SAFE_INTEGER).add(bdt(1))).toThrow(code("invalidMoney"));
  });

  it("throws when subtraction leaves the safe integer range", () => {
    expect(() => bdt(-Number.MAX_SAFE_INTEGER).subtract(bdt(1))).toThrow(code("invalidMoney"));
  });

  it("adds, subtracts and negates exactly", () => {
    expect(bdt(5).add(bdt(7)).minor).toBe(12);
    expect(bdt(5).subtract(bdt(7)).minor).toBe(-2);
    expect(bdt(5).negate().minor).toBe(-5);
  });

  it("normalizes negative zero", () => {
    expect(Object.is(bdt(0).negate().minor, 0)).toBe(true);
    expect(bdt(0).negate().isZero()).toBe(true);
  });

  it("reports sign and equality", () => {
    expect(bdt(0).isZero()).toBe(true);
    expect(bdt(1).isPositive()).toBe(true);
    expect(bdt(-1).isNegative()).toBe(true);
    expect(bdt(1).isNegative()).toBe(false);
    expect(bdt(3).equals(bdt(3))).toBe(true);
    expect(bdt(3).equals(bdt(4))).toBe(false);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(bdt(1))).toBe(true);
  });

  it("rejects mixed currencies", () => {
    const other = Money.ofMinor(1, "USD" as unknown as CurrencyCode);
    expect(() => other.add(bdt(1))).toThrow(code("currencyMismatch"));
    expect(() => bdt(1).subtract(other)).toThrow(code("currencyMismatch"));
  });

  it("equals is false across currencies", () => {
    const other = Money.ofMinor(1, "USD" as unknown as CurrencyCode);
    expect(bdt(1).equals(other)).toBe(false);
  });
});

describe("Money.allocate", () => {
  it("allocates exactly, largest remainder first", () => {
    expect(
      bdt(100)
        .allocate([1, 1, 1])
        .map((m) => m.minor),
    ).toEqual([34, 33, 33]);
  });

  it("respects weights", () => {
    expect(
      bdt(10)
        .allocate([1, 2])
        .map((m) => m.minor),
    ).toEqual([3, 7]);
    expect(
      bdt(10)
        .allocate([3, 1])
        .map((m) => m.minor),
    ).toEqual([8, 2]);
    expect(
      bdt(5)
        .allocate([0, 1])
        .map((m) => m.minor),
    ).toEqual([0, 5]);
  });

  it("allocates a negative amount so parts still sum exactly", () => {
    const parts = bdt(-100)
      .allocate([1, 1, 1])
      .map((m) => m.minor);
    expect(parts).toEqual([-34, -33, -33]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-100);
  });

  it("allocates zero", () => {
    expect(
      bdt(0)
        .allocate([1, 2])
        .map((m) => m.minor),
    ).toEqual([0, 0]);
  });

  it.each([[[]], [[-1, 2]], [[1.5, 1]], [[0, 0]], [[NaN]], [[Number.MAX_SAFE_INTEGER + 1]]])(
    "rejects invalid ratios %j",
    (ratios) => {
      expect(() => bdt(10).allocate(ratios)).toThrow(code("invalidMoney"));
    },
  );

  it("handles large amounts and ratios without precision loss", () => {
    const parts = bdt(Number.MAX_SAFE_INTEGER).allocate([
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
      1,
    ]);
    expect(parts.reduce((a, m) => a + BigInt(m.minor), 0n)).toBe(BigInt(Number.MAX_SAFE_INTEGER));
  });

  it("property: parts always sum to the original", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }),
        fc
          .array(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), {
            minLength: 1,
            maxLength: 8,
          })
          .filter((r) => r.some((x) => x > 0)),
        (amount, ratios) => {
          const parts = bdt(amount).allocate(ratios);
          expect(parts).toHaveLength(ratios.length);
          expect(parts.reduce((a, m) => a + BigInt(m.minor), 0n)).toBe(BigInt(amount));
        },
      ),
    );
  });
});
