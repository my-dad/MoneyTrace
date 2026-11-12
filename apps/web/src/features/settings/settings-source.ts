/** Preferences and AI usage. No read model carries them to the client yet, so only a fixture implements it. */

export type ReportingCycle = { kind: "calendarMonth" } | { kind: "salaryCycle"; startDay: number }; // 1–28

export type ReminderSettings = {
  frequency: "daily" | "weekly" | "off";
  digestLocalTime: string; // "HH:MM"
  minThresholdMinor: number;
  quietHours?: { startLocalTime: string; endLocalTime: string };
};

export type AiUsage = { spentTodayUsdMicros: number; dailyLimitUsdMicros: number; spentMonthUsdMicros: number; monthlyLimitUsdMicros: number };

export type SettingsView = {
  displayName: string;
  reportingCycle: ReportingCycle;
  notifications: ReminderSettings;
  ai: AiUsage;
};

export type SettingsSource = { load: () => Promise<SettingsView> };
