import { describe, expect, it } from "vitest";
import { DomainError } from "../errors";
import {
  decide,
  DEFAULT_CONFIDENCE_CONFIG as DEFAULT,
  type ConfidenceConfig,
  type DecisionInput,
} from "./confidence-policy";

const config: ConfidenceConfig = { version: 1, aiAutoPostThresholdBp: 9000 };
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

describe("decide", () => {
  it("auto-posts a clear deterministic match", () => {
    expect(decide(clear, config)).toEqual({ outcome: "autoPost", rule: "deterministicClear" });
  });
  it("never auto-posts AI output with the default threshold", () => {
    expect(decide({ ...clear, source: "ai", confidenceBp: 10000 }, DEFAULT).outcome).toBe(
      "needsClarification",
    );
  });
  it("auto-posts AI output at the threshold once configured", () => {
    expect(
      decide(
        { ...clear, source: "ai", confidenceBp: 9000 },
        { version: 2, aiAutoPostThresholdBp: 9000 },
      ).outcome,
    ).toBe("autoPost");
  });
  it("asks about AI output just below the threshold", () => {
    expect(decide({ ...clear, source: "ai", confidenceBp: 8999 }, config).outcome).toBe(
      "needsClarification",
    );
  });
  it("never auto-posts anything in a retried-after-unknown chain", () => {
    expect(decide({ ...clear, retriedAfterUnknownInChain: true }, config).outcome).toBe(
      "needsClarification",
    );
  });
  it.each([{ extractionUsable: false }, { invariantsPass: false }])("fails %o", (o) => {
    expect(decide({ ...clear, ...o }, config).outcome).toBe("failed");
  });
  it.each([
    { accountMappingUnambiguous: false },
    { unresolvedDuplicateCandidate: true },
    { parsersConflict: true },
  ])("asks about %o", (o) => {
    expect(decide({ ...clear, ...o }, config).outcome).toBe("needsClarification");
  });
  it("fails before asking when both apply", () => {
    expect(decide({ ...clear, invariantsPass: false, parsersConflict: true }, config).outcome).toBe(
      "failed",
    );
  });
  it.each([-1, 10001, 50.5, Number.NaN])("rejects confidence %s", (confidenceBp) => {
    expect(() => decide({ ...clear, confidenceBp }, config)).toThrow(DomainError);
  });
  it("rejects an out-of-range threshold", () => {
    expect(() => decide(clear, { version: 1, aiAutoPostThresholdBp: 10002 })).toThrow(DomainError);
  });
});
