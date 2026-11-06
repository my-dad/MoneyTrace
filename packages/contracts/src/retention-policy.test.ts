import { describe, expect, it } from "vitest";
import { DEFAULT_RETENTION_POLICY, retentionPolicySchema } from "./retention-policy";

describe("retention policy", () => {
  it("default parses", () => {
    expect(retentionPolicySchema.parse(DEFAULT_RETENTION_POLICY)).toEqual(DEFAULT_RETENTION_POLICY);
  });
  it.each([
    "temporaryUploadMaxHours",
    "providerResultDays",
    "conversationDays",
    "operationalLogDays",
  ])("rejects zero and negative %s", (field) => {
    expect(
      retentionPolicySchema.safeParse({ ...DEFAULT_RETENTION_POLICY, [field]: 0 }).success,
    ).toBe(false);
    expect(
      retentionPolicySchema.safeParse({ ...DEFAULT_RETENTION_POLICY, [field]: -1 }).success,
    ).toBe(false);
  });
  it("rejects unknown fields", () => {
    expect(retentionPolicySchema.safeParse({ ...DEFAULT_RETENTION_POLICY, extra: 1 }).success).toBe(
      false,
    );
  });
});
