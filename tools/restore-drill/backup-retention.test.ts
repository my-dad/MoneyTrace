import { describe, expect, it } from "vitest";
import { DEFAULT_RETENTION_POLICY } from "@moneytrace/contracts";
import { backupRetention } from "./backup-retention";

describe("backupRetention", () => {
  it("uses the retention policy's default", () => {
    expect(backupRetention({})).toBe(`${String(DEFAULT_RETENTION_POLICY.backupDays)}d`);
  });

  it("takes an override from BACKUP_RETENTION_DAYS", () => {
    expect(backupRetention({ BACKUP_RETENTION_DAYS: "30" })).toBe("30d");
  });

  it("refuses an override outside 1 to 98 days, or one that isn't a whole number", () => {
    for (const value of ["0", "99", "7.5", "two", ""]) {
      expect(() => backupRetention({ BACKUP_RETENTION_DAYS: value }), value).toThrow("BACKUP_RETENTION_DAYS");
    }
  });
});
