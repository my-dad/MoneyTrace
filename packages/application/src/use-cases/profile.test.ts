import { asOwnerId } from "@moneytrace/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeClock } from "../testing/fakes";
import { InMemoryProfiles } from "../testing/in-memory-profiles";
import { profileDefaults } from "../testing/profile-contract";
import { RecordVisit, UpdateProfile } from "./profile";

const alice = asOwnerId("alice");
let profiles: InMemoryProfiles;
let clock: FakeClock;

beforeEach(async () => {
  profiles = new InMemoryProfiles();
  clock = new FakeClock(10_000);
  await profiles.createIfAbsent(alice, profileDefaults());
});

const update = (input: { displayName: string; avatar: { kind: "google" } | { kind: "initials"; color: string } }) =>
  new UpdateProfile({ profiles, clock }).execute({ ownerId: alice, ...input });

describe("UpdateProfile", () => {
  it("saves a tidied name and the avatar, and marks the profile complete once", async () => {
    await update({ displayName: "  Mabrur   Chowdhury ", avatar: { kind: "google" } });
    clock.advance(5_000);
    await update({ displayName: "Mabrur", avatar: { kind: "initials", color: "violet" } });
    expect(await profiles.get(alice)).toMatchObject({ displayName: "Mabrur", avatar: { kind: "initials", color: "violet" }, profileCompletedAtMs: 10_000 });
  });

  it("keeps the first save's name tidy: inner spaces collapse", async () => {
    await update({ displayName: "  Mabrur   Chowdhury ", avatar: { kind: "google" } });
    expect((await profiles.get(alice))?.displayName).toBe("Mabrur Chowdhury");
  });

  it("refuses a blank or overlong name", async () => {
    await expect(update({ displayName: "   ", avatar: { kind: "google" } })).rejects.toMatchObject({ code: "invalidIntent" });
    await expect(update({ displayName: "x".repeat(61), avatar: { kind: "google" } })).rejects.toMatchObject({ code: "invalidIntent" });
  });

  it("refuses a colour outside the palette", async () => {
    await expect(update({ displayName: "M", avatar: { kind: "initials", color: "neon" } })).rejects.toMatchObject({ code: "invalidIntent" });
  });

  it("needs a profile to exist (sign-in sets it up)", async () => {
    await expect(new UpdateProfile({ profiles, clock }).execute({ ownerId: asOwnerId("nobody"), displayName: "N", avatar: { kind: "google" } })).rejects.toMatchObject({ code: "resourceNotFound" });
  });
});

describe("RecordVisit", () => {
  it("returns the previous visit, null the first time", async () => {
    const visit = new RecordVisit({ profiles, clock });
    expect(await visit.execute({ ownerId: alice })).toEqual({ previousSeenAtMs: null });
    clock.advance(86_400_000);
    expect(await visit.execute({ ownerId: alice })).toEqual({ previousSeenAtMs: 10_000 });
  });
});
