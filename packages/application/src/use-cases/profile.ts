import { avatarSchema } from "@moneytrace/contracts";
import { DomainError, type OwnerId } from "@moneytrace/domain";
import type { Clock } from "../ports/clock";
import type { UserProfileRepository } from "../ports/user-profile-repository";

type Deps = { profiles: UserProfileRepository; clock: Clock };

const NAME_MAX = 60;

/** The name and picture the user chose. The first save marks the profile as set up. */
export class UpdateProfile {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: { ownerId: OwnerId; displayName: string; avatar: unknown }): Promise<{ updated: true }> {
    const { profiles, clock } = this.deps;
    const displayName = input.displayName.trim().replace(/\s+/g, " ");
    if (displayName === "" || displayName.length > NAME_MAX) throw new DomainError("invalidIntent", "a name is 1 to 60 characters");
    const avatar = avatarSchema.safeParse(input.avatar);
    if (!avatar.success) throw new DomainError("invalidIntent", "that picture choice isn't offered");
    const current = await profiles.get(input.ownerId);
    if (current === null) throw new DomainError("resourceNotFound", "no profile yet");
    await profiles.update(input.ownerId, {
      displayName,
      avatar: avatar.data,
      ...(current.profileCompletedAtMs === undefined ? { profileCompletedAtMs: clock.nowMs() } : {}),
    });
    return { updated: true };
  }
}

/** Notes this visit and says when the previous one was, for the welcome-back overview. */
export class RecordVisit {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: { ownerId: OwnerId }): Promise<{ previousSeenAtMs: number | null }> {
    const { profiles, clock } = this.deps;
    if ((await profiles.get(input.ownerId)) === null) throw new DomainError("resourceNotFound", "no profile yet");
    return { previousSeenAtMs: await profiles.recordVisit(input.ownerId, clock.nowMs()) };
  }
}
