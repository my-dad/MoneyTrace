import { DomainError, type OwnerId } from "@moneytrace/domain";
import type { ProfilePatch } from "../ports/user-profile-repository";

function isKnownTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

type Deps = { profiles: { update: (ownerId: OwnerId, patch: ProfilePatch) => Promise<void> } };

/** Reminder settings and timezone only for now; anything else is refused rather than ignored. */
export class UpdateSettings {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    timezone?: string;
    reminders?: ProfilePatch["notifications"];
    reportingCycle?: unknown;
    aiBudget?: unknown;
  }): Promise<{ updated: boolean }> {
    if (input.reportingCycle !== undefined || input.aiBudget !== undefined) {
      throw new DomainError("invalidIntent", "that setting cannot be changed yet");
    }
    if (input.timezone !== undefined && !isKnownTimezone(input.timezone)) {
      throw new DomainError("invalidIntent", "unknown timezone");
    }
    await this.deps.profiles.update(input.ownerId, {
      ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
      ...(input.reminders === undefined ? {} : { notifications: input.reminders }),
    });
    return { updated: true };
  }
}
