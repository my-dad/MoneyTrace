import { DEFAULT_RETENTION_POLICY } from "@moneytrace/contracts";
import { asAccountId, type OwnerId } from "@moneytrace/domain";
import type { AccountRepository } from "../ports/account-repository";
import type { Clock } from "../ports/clock";
import type { UserProfileRepository } from "../ports/user-profile-repository";

/** Holds cash whose place the user has not told us yet: a withdrawal moves money here at once. */
export const SYSTEM_CASH_ACCOUNT_ID = asAccountId("cash-unassigned");

type Deps = { profiles: UserProfileRepository; accounts: AccountRepository; clock: Clock };

export class BootstrapUser {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  /** Idempotent: a second call leaves the existing profile, and any settings in it, untouched. */
  async execute(input: { ownerId: OwnerId }): Promise<{ created: boolean }> {
    const created = await this.deps.profiles.createIfAbsent(input.ownerId, {
      baseCurrency: "BDT",
      timezone: "Asia/Dhaka",
      reportingCycle: { kind: "calendarMonth" },
      notifications: { digestLocalTime: "20:00", frequency: "daily", minThresholdMinor: 0 },
      retentionPolicyVersion: DEFAULT_RETENTION_POLICY.version,
      createdAtMs: this.deps.clock.nowMs(),
    });
    await this.deps.accounts.ensure(input.ownerId, {
      id: SYSTEM_CASH_ACCOUNT_ID,
      kind: "cash",
      name: "Cash · place not set",
      currency: "BDT",
      status: "active",
      createdAtMs: this.deps.clock.nowMs(),
    });
    return { created };
  }
}
