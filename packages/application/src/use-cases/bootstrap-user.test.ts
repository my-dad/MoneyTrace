import { userProfileSchema } from "@moneytrace/contracts";
import { asOwnerId, type OwnerId } from "@moneytrace/domain";
import { describe, expect, it } from "vitest";
import type { UserProfileDefaults, UserProfileRepository } from "../ports/user-profile-repository";
import { FakeClock } from "../testing/fakes";
import { InMemoryAccountRepository } from "../testing/in-memory-ledger";
import { BootstrapUser, SYSTEM_CASH_ACCOUNT_ID } from "./bootstrap-user";

class MemoryProfiles implements UserProfileRepository {
  readonly docs = new Map<string, UserProfileDefaults>();
  get(ownerId: OwnerId): Promise<UserProfileDefaults | null> {
    return Promise.resolve(this.docs.get(ownerId) ?? null);
  }
  createIfAbsent(ownerId: OwnerId, defaults: UserProfileDefaults): Promise<boolean> {
    if (this.docs.has(ownerId)) return Promise.resolve(false);
    this.docs.set(ownerId, defaults);
    return Promise.resolve(true);
  }
}

describe("BootstrapUser", () => {
  it("creates a schema-valid profile once, then reports not created and keeps it", async () => {
    const profiles = new MemoryProfiles();
    const accounts = new InMemoryAccountRepository();
    const uc = new BootstrapUser({ profiles, accounts, clock: new FakeClock(5_000) });
    const owner = asOwnerId("alice");
    expect(await uc.execute({ ownerId: owner })).toEqual({ created: true });
    const first = profiles.docs.get("alice");
    expect(userProfileSchema.safeParse(first).success).toBe(true);
    expect(first?.createdAtMs).toBe(5_000);
    expect(
      await new BootstrapUser({ profiles, accounts, clock: new FakeClock(9_000) }).execute({
        ownerId: owner,
      }),
    ).toEqual({
      created: false,
    });
    expect(profiles.docs.get("alice")).toBe(first);
  });

  it("creates the system cash wallet once, even if the profile already existed", async () => {
    const profiles = new MemoryProfiles();
    const accounts = new InMemoryAccountRepository();
    const uc = new BootstrapUser({ profiles, accounts, clock: new FakeClock(5_000) });
    const owner = asOwnerId("alice");
    await uc.execute({ ownerId: owner });
    await uc.execute({ ownerId: owner });
    expect(await accounts.getMany(owner, [SYSTEM_CASH_ACCOUNT_ID])).toEqual([
      expect.objectContaining({ kind: "cash", name: "Cash · place not set", status: "active" }),
    ]);
  });
});
