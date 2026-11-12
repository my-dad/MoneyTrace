import { userProfileSchema } from "@moneytrace/contracts";
import { describe, expect, it } from "vitest";
import { createFixtureSettingsSource } from "./fixture-settings-source";

describe("fixture settings source", () => {
  it("matches the settings schema shape", async () => {
    const view = await createFixtureSettingsSource().load();
    expect(userProfileSchema.shape.reportingCycle.parse(view.reportingCycle)).toEqual({ kind: "salaryCycle", startDay: 25 });
    expect(userProfileSchema.shape.notifications.parse(view.notifications)).toMatchObject({ frequency: "daily", digestLocalTime: "21:00" });
    expect(view.ai).toEqual({ spentTodayUsdMicros: 12_000, dailyLimitUsdMicros: 50_000, spentMonthUsdMicros: 1_430_000, monthlyLimitUsdMicros: 5_000_000 });
  });
});
