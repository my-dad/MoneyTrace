import { describe, expect, it } from "vitest";
import { asOwnerId } from "@moneytrace/domain";
import { createWorld } from "../testing/world";
import { CreateAccount } from "./create-account";

const owner = asOwnerId("alice");

describe("CreateAccount", () => {
  it("creates an active account with a generated id and the clock time", async () => {
    const w = createWorld();
    const useCase = new CreateAccount({ accounts: w.accounts, ids: w.ids, clock: w.clock });
    const { accountId } = await useCase.execute({
      ownerId: owner,
      kind: "bank",
      name: "City Bank",
      currency: "BDT",
    });
    expect(accountId).toBe("id-1");
    expect(await w.accounts.getMany(owner, [accountId])).toEqual([
      {
        id: accountId,
        kind: "bank",
        name: "City Bank",
        currency: "BDT",
        status: "active",
        createdAtMs: w.clock.nowMs(),
      },
    ]);
  });

  it("rejects a blank name and writes nothing", async () => {
    const w = createWorld();
    const useCase = new CreateAccount({ accounts: w.accounts, ids: w.ids, clock: w.clock });
    await expect(
      useCase.execute({ ownerId: owner, kind: "cash", name: "   ", currency: "BDT" }),
    ).rejects.toThrow(expect.objectContaining({ code: "invalidIntent" }) as Error);
    expect(await w.accounts.getMany(owner, [])).toEqual([]);
  });
});
