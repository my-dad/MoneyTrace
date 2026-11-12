import type { SettingsSource, SettingsView } from "./settings-source";

const FIXTURE_SETTINGS: SettingsView = {
  displayName: "Demo",
  reportingCycle: { kind: "salaryCycle", startDay: 25 },
  notifications: { frequency: "daily", digestLocalTime: "21:00", minThresholdMinor: 50_000, quietHours: { startLocalTime: "23:00", endLocalTime: "07:00" } },
  ai: { spentTodayUsdMicros: 12_000, dailyLimitUsdMicros: 50_000, spentMonthUsdMicros: 1_430_000, monthlyLimitUsdMicros: 5_000_000 },
};

export function createFixtureSettingsSource(): SettingsSource {
  return { load: () => Promise.resolve(structuredClone(FIXTURE_SETTINGS)) };
}
