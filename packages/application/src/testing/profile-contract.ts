import { asOwnerId } from "@moneytrace/domain";
import { describe, expect, it } from "vitest";
import type { UserProfileDefaults, UserProfileRepository } from "../ports/user-profile-repository";

const alice = asOwnerId("alice");
const bob = asOwnerId("bob");

export const profileDefaults = (): UserProfileDefaults => ({
  baseCurrency: "BDT",
  timezone: "Asia/Dhaka",
  reportingCycle: { kind: "calendarMonth" },
  notifications: { digestLocalTime: "20:00", frequency: "daily", minThresholdMinor: 0 },
  retentionPolicyVersion: 1,
  createdAtMs: 1,
});

/** The same behaviour from the in-memory fake and the Postgres adapter. */
export function describeProfileContract(name: string, make: () => Promise<UserProfileRepository>): void {
  describe(`user profiles (${name})`, () => {
    it("keeps the name, avatar and when the profile was completed", async () => {
      const repo = await make();
      await repo.createIfAbsent(alice, profileDefaults());
      await repo.update(alice, { displayName: "Mabrur", avatar: { kind: "initials", color: "teal" }, profileCompletedAtMs: 5 });
      expect(await repo.get(alice)).toMatchObject({ displayName: "Mabrur", avatar: { kind: "initials", color: "teal" }, profileCompletedAtMs: 5, timezone: "Asia/Dhaka" });
    });

    it("records each visit and returns the one before", async () => {
      const repo = await make();
      await repo.createIfAbsent(alice, profileDefaults());
      expect(await repo.recordVisit(alice, 1_000)).toBeNull();
      expect(await repo.recordVisit(alice, 2_000)).toBe(1_000);
      expect((await repo.get(alice))?.lastSeenAtMs).toBe(2_000);
    });

    it("a visit never moves back in time", async () => {
      const repo = await make();
      await repo.createIfAbsent(alice, profileDefaults());
      await repo.recordVisit(alice, 5_000);
      expect(await repo.recordVisit(alice, 4_000)).toBe(5_000);
      expect((await repo.get(alice))?.lastSeenAtMs).toBe(5_000);
    });

    it("one owner's profile is untouched by another's", async () => {
      const repo = await make();
      await repo.createIfAbsent(alice, profileDefaults());
      await repo.createIfAbsent(bob, profileDefaults());
      await repo.update(bob, { displayName: "Bob" });
      await repo.recordVisit(bob, 9);
      expect(await repo.get(alice)).toEqual(profileDefaults());
    });
  });
}
