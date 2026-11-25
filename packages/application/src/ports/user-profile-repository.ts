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
  displayName?: string;
  avatar?: { kind: "google" } | { kind: "initials"; color: string };
  profileCompletedAtMs?: number;
  lastSeenAtMs?: number;
};

export type ProfilePatch = {
  timezone?: string;
  notifications?: UserProfileDefaults["notifications"];
  displayName?: string;
  avatar?: { kind: "google" } | { kind: "initials"; color: string };
  profileCompletedAtMs?: number;
};

export type UserProfileRepository = {
  update(ownerId: OwnerId, patch: ProfilePatch): Promise<void>;
  get(ownerId: OwnerId): Promise<UserProfileDefaults | null>;
  /** Atomically creates `users/{ownerId}` only when absent. Returns whether it was created; never overwrites. */
  createIfAbsent(ownerId: OwnerId, defaults: UserProfileDefaults): Promise<boolean>;
  /**
   * Stores this visit and returns the one before (null on the first). Atomic, and never moves
   * the stored visit back in time: an older `nowMs` leaves it and returns the newer one.
   */
  recordVisit(ownerId: OwnerId, nowMs: number): Promise<number | null>;
};
