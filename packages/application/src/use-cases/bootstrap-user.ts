import { DEFAULT_RETENTION_POLICY } from "@moneytrace/contracts";
import type { OwnerId } from "@moneytrace/domain";
import type { Clock } from "../ports/clock";
import type { UserProfileRepository } from "../ports/user-profile-repository";

export class BootstrapUser {
  private readonly deps: { profiles: UserProfileRepository; clock: Clock };

  constructor(deps: { profiles: UserProfileRepository; clock: Clock }) {
    this.deps = deps;
  }

  /** Idempotent: a second call leaves the existing profile, and any settings in it, untouched. */
  async execute(input: { ownerId: OwnerId }): Promise<{ created: boolean }> {
    const created = await this.deps.profiles.createIfAbsent(input.ownerId, {
      baseCurrency: "BDT",
      reportingCycle: { kind: "calendarMonth" },
      notifications: { digestLocalTime: "20:00", frequency: "daily", minThresholdMinor: 0 },
      retentionPolicyVersion: DEFAULT_RETENTION_POLICY.version,
      createdAtMs: this.deps.clock.nowMs(),
    });
    return { created };
  }
}
