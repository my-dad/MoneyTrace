import { describe, expect, it } from "vitest";
import { isTerminal, STAGE_INPUT_STATUS, type SourceEventStatus } from "./source-event";

describe("source event lifecycle", () => {
  it.each<[SourceEventStatus, boolean]>([
    ["posted", true],
    ["linkedAsDuplicate", true],
    ["rejected", true],
    ["cancelled", true],
    ["received", false],
    ["normalized", false],
    ["interpreted", false],
    ["matched", false],
    ["decided", false],
    ["pending", false],
    ["deadLetter", false],
  ])("isTerminal(%s) is %s", (status, expected) => {
    expect(isTerminal(status)).toBe(expected);
  });

  it("maps stages to their input status in order", () => {
    expect(Object.entries(STAGE_INPUT_STATUS)).toEqual([
      ["normalize", "received"],
      ["interpret", "normalized"],
      ["match", "interpreted"],
      ["decide", "matched"],
      ["post", "decided"],
    ]);
  });
});
