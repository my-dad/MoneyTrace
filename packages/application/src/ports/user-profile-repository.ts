import type { OwnerId } from "@moneytrace/domain";

export type UserProfileDefaults = {
  baseCurrency: "BDT";
  timezone: string;
  reportingCycle: { kind: "calendarMonth" };
  notifications: {
    digestLocalTime: string;
    frequency: "daily" | "weekly" | "off";
    minThresholdMinor: number;
  };
  retentionPolicyVersion: number;
  createdAtMs: number;
};

export type ProfilePatch = {
  timezone?: string;
  notifications?: UserProfileDefaults["notifications"];
};

export type UserProfileRepository = {
  update(ownerId: OwnerId, patch: ProfilePatch): Promise<void>;
  get(ownerId: OwnerId): Promise<UserProfileDefaults | null>;
  /** Atomically creates `users/{ownerId}` only when absent. Returns whether it was created; never overwrites. */
  createIfAbsent(ownerId: OwnerId, defaults: UserProfileDefaults): Promise<boolean>;
};
