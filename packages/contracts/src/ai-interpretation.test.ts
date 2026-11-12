import { describe, expect, it } from "vitest";
import { aiInterpretationSchema } from "./ai-interpretation";

const candidate = { kind: "purchase", amountMinor: 200_000, currency: "BDT", occurredAtIso: null };

describe("aiInterpretationSchema", () => {
  it("reads a source name and its last digits", () => {
    const parsed = aiInterpretationSchema.parse({ kind: "transaction", confidenceBp: 9000, candidate: { ...candidate, sourceName: "Nagad", sourceMask: "1234" } });
    expect(parsed).toMatchObject({ candidate: { sourceName: "Nagad", sourceMask: "1234" } });
  });

  it("refuses a source mask that isn't 3 or 4 digits", () => {
    expect(aiInterpretationSchema.safeParse({ kind: "transaction", confidenceBp: 9000, candidate: { ...candidate, sourceMask: "12345" } }).success).toBe(false);
  });

  it("accepts a question with quick-answer options and a partial reading", () => {
    const parsed = aiInterpretationSchema.parse({ kind: "question", text: "Paid from your Nagad, or received?", options: ["Paid from it", "Received"], candidate });
    expect(parsed).toMatchObject({ kind: "question", options: ["Paid from it", "Received"] });
  });

  it("refuses more than 4 options, an over-long option, and unknown keys", () => {
    const base = { kind: "question", text: "Which?" };
    expect(aiInterpretationSchema.safeParse({ ...base, options: ["a", "b", "c", "d", "e"] }).success).toBe(false);
    expect(aiInterpretationSchema.safeParse({ ...base, options: ["x".repeat(41)] }).success).toBe(false);
    expect(aiInterpretationSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});
