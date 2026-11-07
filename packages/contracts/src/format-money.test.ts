import { describe, expect, it } from "vitest";
import { formatBdt } from "./format-money";

describe("formatBdt", () => {
  it.each([
    [12500000, "৳1,25,000"],
    [500000, "৳5,000"],
    [185000, "৳1,850"],
    [100, "৳1"],
    [50050, "৳500.50"],
    [-500000, "-৳5,000"],
    [0, "৳0"],
    [5, "৳0.05"],
    [15020000000, "৳15,02,00,000"],
  ])("formats %i as %s", (minor, text) => {
    expect(formatBdt(minor)).toBe(text);
  });
});
