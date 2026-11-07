import type { OwnerId } from "@moneytrace/domain";

export type UserProfileDefaults = {
  baseCurrency: "BDT";
  reportingCycle: { kind: "calendarMonth" };
  notifications: {
    digestLocalTime: string;
    frequency: "daily" | "weekly" | "off";
    minThresholdMinor: number;
  };
  retentionPolicyVersion: number;
  createdAtMs: number;
};

export type UserProfileRepository = {
  /** Atomically creates `users/{ownerId}` only when absent. Returns whether it was created; never overwrites. */
  createIfAbsent(ownerId: OwnerId, defaults: UserProfileDefaults): Promise<boolean>;
};
