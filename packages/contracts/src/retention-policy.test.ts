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
    "backupDays",
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
  it("keeps backups within Firestore's 14-week limit", () => {
    expect(retentionPolicySchema.safeParse({ ...DEFAULT_RETENTION_POLICY, backupDays: 98 }).success).toBe(true);
    expect(retentionPolicySchema.safeParse({ ...DEFAULT_RETENTION_POLICY, backupDays: 99 }).success).toBe(false);
  });
});
