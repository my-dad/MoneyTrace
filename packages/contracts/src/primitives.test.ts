import { describe, expect, it } from "vitest";
import { documentId, epochMs, minorAmount, positiveMinorAmount } from "./primitives";

describe("primitives", () => {
  it.each([12.5, "100", Number.NaN, 2 ** 53, Number.POSITIVE_INFINITY])(
    "rejects malformed amount %s",
    (v) => {
      expect(minorAmount.safeParse(v).success).toBe(false);
    },
  );
  it("accepts signed integers", () => {
    expect(minorAmount.safeParse(-500).success).toBe(true);
  });
  it("positive amount rejects zero and negatives", () => {
    expect(positiveMinorAmount.safeParse(0).success).toBe(false);
    expect(positiveMinorAmount.safeParse(-1).success).toBe(false);
    expect(positiveMinorAmount.safeParse(1).success).toBe(true);
  });
  it("epochMs rejects negatives and fractions", () => {
    expect(epochMs.safeParse(-1).success).toBe(false);
    expect(epochMs.safeParse(1.5).success).toBe(false);
  });
  it.each(["", "a/b", "a b", "x".repeat(129)])("documentId rejects %j", (v) => {
    expect(documentId.safeParse(v).success).toBe(false);
  });
});
