import { describe, expect, it } from "vitest";
import { parseBdtInput } from "./parse-bdt-input";

describe("parseBdtInput", () => {
  it.each([
    ["1850", 185000],
    ["৳1,25,000.50", 12500050],
    ["1,250.5", 125050],
    ["0.05", 5],
    [" ৳ 500 ", 50000],
    ["1234567.89", 123456789],
  ])("reads %j as %i minor units, exactly", (text, minor) => {
    expect(parseBdtInput(text)).toBe(minor);
  });

  it.each(["", "abc", "12.345", "-500", "0", "0.00", "1e5", "1.2.3", "99999999999999999"])(
    "refuses %j rather than guessing",
    (text) => {
      expect(parseBdtInput(text)).toBeNull();
    },
  );

  it("a cash count may be zero, and still refuses anything unclear", () => {
    expect(parseBdtInput("0", { allowZero: true })).toBe(0);
    expect(parseBdtInput("0.00", { allowZero: true })).toBe(0);
    expect(parseBdtInput("2,300.50", { allowZero: true })).toBe(230050);
    expect(parseBdtInput("0")).toBeNull();
    expect(parseBdtInput("-1", { allowZero: true })).toBeNull();
    expect(parseBdtInput("abc", { allowZero: true })).toBeNull();
  });
});
