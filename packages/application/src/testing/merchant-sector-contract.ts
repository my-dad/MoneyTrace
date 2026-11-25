import { asOwnerId } from "@moneytrace/domain";
import { describe, expect, it } from "vitest";
import type { MerchantSectorRepository } from "../ports/merchant-sector-repository";

const alice = asOwnerId("alice");
const bob = asOwnerId("bob");

/** The same behaviour from the in-memory fake and the Postgres adapter. */
export function describeMerchantSectorContract(name: string, make: () => Promise<MerchantSectorRepository>): void {
  describe(`merchant sectors (${name})`, () => {
    it("stores a tag and reads it back", async () => {
      const repo = await make();
      await repo.upsert(alice, { id: "foodpanda", merchantName: "Foodpanda", sector: "food", updatedAtMs: 1 });
      expect(await repo.get(alice, "foodpanda")).toEqual({ id: "foodpanda", merchantName: "Foodpanda", sector: "food", updatedAtMs: 1 });
    });

    it("a later tag replaces the earlier one", async () => {
      const repo = await make();
      await repo.upsert(alice, { id: "shop", merchantName: "Shop", sector: "food", updatedAtMs: 1 });
      await repo.upsert(alice, { id: "shop", merchantName: "Shop", sector: "health", updatedAtMs: 2 });
      expect((await repo.get(alice, "shop"))?.sector).toBe("health");
    });

    it("one owner never sees another's tags", async () => {
      const repo = await make();
      await repo.upsert(alice, { id: "foodpanda", merchantName: "Foodpanda", sector: "food", updatedAtMs: 1 });
      expect(await repo.get(bob, "foodpanda")).toBeNull();
    });
  });
}
