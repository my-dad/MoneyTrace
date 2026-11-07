import { describe, expect, it } from "vitest";
import { monthRangeInZone, nextLocalTimeMs } from "./zoned-time";

const DHAKA = "Asia/Dhaka";

describe("nextLocalTimeMs", () => {
  it("is later today when the time has not passed", () => {
    expect(nextLocalTimeMs(Date.parse("2026-04-01T06:00:00Z"), DHAKA, "20:00")).toBe(
      Date.parse("2026-04-01T14:00:00Z"),
    );
  });
  it("is tomorrow when it has passed, including exactly now", () => {
    expect(nextLocalTimeMs(Date.parse("2026-04-01T14:00:00Z"), DHAKA, "20:00")).toBe(
      Date.parse("2026-04-02T14:00:00Z"),
    );
  });
  it("rolls over a month end", () => {
    expect(nextLocalTimeMs(Date.parse("2026-04-30T15:00:00Z"), DHAKA, "20:00")).toBe(
      Date.parse("2026-05-01T14:00:00Z"),
    );
  });
});

describe("monthRangeInZone", () => {
  it("starts at Dhaka midnight, not UTC", () => {
    expect(monthRangeInZone(Date.parse("2026-10-31T18:30:00Z"), DHAKA)).toEqual({
      fromMs: Date.parse("2026-10-31T18:00:00Z"),
      toMs: Date.parse("2026-11-30T18:00:00Z"),
    });
  });
  it("rolls over a year end", () => {
    expect(monthRangeInZone(Date.parse("2026-12-15T00:00:00Z"), DHAKA).toMs).toBe(
      Date.parse("2026-12-31T18:00:00Z"),
    );
  });
});
