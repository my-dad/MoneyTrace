import { describe, expect, it } from "vitest";
import { decide, type ConfidenceConfig, type DecisionInput } from "./confidence-policy";

const config: ConfidenceConfig = { version: 1, aiAutoPostThresholdBp: 9000 };
const disabled: ConfidenceConfig = { version: 1, aiAutoPostThresholdBp: 10001 };
const clear: DecisionInput = {
  extractionUsable: true,
  invariantsPass: true,
  accountMappingUnambiguous: true,
  unresolvedDuplicateCandidate: false,
  parsersConflict: false,
  source: "deterministicParser",
  confidenceBp: 0,
  retriedAfterUnknownInChain: false,
};
const ai: DecisionInput = { ...clear, source: "ai", confidenceBp: 10000 };
const invalidConfig = expect.objectContaining({ code: "invalidConfig" }) as Error;

describe("decide", () => {
  it("auto-posts a clear deterministic match", () => {
    expect(decide(clear, config)).toEqual({ outcome: "autoPost", rule: "deterministicClear" });
  });
  it("never auto-posts AI output with a disabled threshold", () => {
    expect(decide(ai, disabled)).toEqual({
      outcome: "needsClarification",
      rule: "aiBelowThreshold",
    });
  });
  it("auto-posts AI output at the threshold", () => {
    expect(decide({ ...ai, confidenceBp: 9000 }, config)).toEqual({
      outcome: "autoPost",
      rule: "aiAboveThreshold",
    });
  });
  it("asks about AI output just below the threshold", () => {
    expect(decide({ ...ai, confidenceBp: 8999 }, config)).toEqual({
      outcome: "needsClarification",
      rule: "aiBelowThreshold",
    });
  });

  it.each([
    ["deterministic", clear],
    ["AI at full confidence", ai],
  ])("never auto-posts a retried-after-unknown chain (%s)", (_n, base) => {
    expect(decide({ ...base, retriedAfterUnknownInChain: true }, config)).toEqual({
      outcome: "needsClarification",
      rule: "retriedAfterUnknown",
    });
  });
  it.each([
    ["deterministic", clear],
    ["AI at full confidence", ai],
  ])("never auto-posts conflicting parsers (%s)", (_n, base) => {
    expect(decide({ ...base, parsersConflict: true }, config)).toEqual({
      outcome: "needsClarification",
      rule: "parsersConflict",
    });
  });

  it.each([
    [{ extractionUsable: false }, "extractionUnusable"],
    [{ invariantsPass: false }, "invariantsFailed"],
  ])("fails %o", (o, rule) => {
    expect(decide({ ...clear, ...o }, config)).toEqual({ outcome: "failed", rule });
  });
  it.each([
    [{ accountMappingUnambiguous: false }, "accountMappingAmbiguous"],
    [{ unresolvedDuplicateCandidate: true }, "duplicateCandidateUnresolved"],
  ])("asks about %o", (o, rule) => {
    expect(decide({ ...clear, ...o }, config)).toEqual({ outcome: "needsClarification", rule });
  });

  describe("precedence", () => {
    const mapping = { accountMappingUnambiguous: false };
    const dup = { unresolvedDuplicateCandidate: true };
    const conflict = { parsersConflict: true };
    const retried = { retriedAfterUnknownInChain: true };
    it.each([
      [
        "unusable extraction over invariants",
        { extractionUsable: false, invariantsPass: false },
        "failed",
        "extractionUnusable",
      ],
      [
        "failed over parsersConflict",
        { invariantsPass: false, ...conflict },
        "failed",
        "invariantsFailed",
      ],
      [
        "failed over retried",
        { extractionUsable: false, ...retried },
        "failed",
        "extractionUnusable",
      ],
      ["failed over mapping", { invariantsPass: false, ...mapping }, "failed", "invariantsFailed"],
      [
        "parsersConflict over retried",
        { ...conflict, ...retried },
        "needsClarification",
        "parsersConflict",
      ],
      [
        "parsersConflict over mapping",
        { ...conflict, ...mapping },
        "needsClarification",
        "parsersConflict",
      ],
      [
        "parsersConflict over duplicate",
        { ...conflict, ...dup },
        "needsClarification",
        "parsersConflict",
      ],
      [
        "retried over mapping",
        { ...retried, ...mapping },
        "needsClarification",
        "retriedAfterUnknown",
      ],
      [
        "retried over duplicate",
        { ...retried, ...dup },
        "needsClarification",
        "retriedAfterUnknown",
      ],
      [
        "mapping over duplicate",
        { ...mapping, ...dup },
        "needsClarification",
        "accountMappingAmbiguous",
      ],
      [
        "mapping over AI threshold",
        { ...mapping, source: "ai" as const, confidenceBp: 10000 },
        "needsClarification",
        "accountMappingAmbiguous",
      ],
      [
        "duplicate over AI threshold",
        { ...dup, source: "ai" as const, confidenceBp: 10000 },
        "needsClarification",
        "duplicateCandidateUnresolved",
      ],
    ])("%s", (_n, o, outcome, rule) => {
      expect(decide({ ...clear, ...o }, config)).toEqual({ outcome, rule });
    });
  });

  it.each([-1, 10001, 50.5, Number.NaN])("rejects confidence %s", (confidenceBp) => {
    expect(() => decide({ ...clear, confidenceBp }, config)).toThrow(invalidConfig);
  });
  it.each([-1, 10002, 9000.5, Number.NaN])("rejects threshold %s", (aiAutoPostThresholdBp) => {
    expect(() => decide(clear, { version: 1, aiAutoPostThresholdBp })).toThrow(invalidConfig);
  });
});
