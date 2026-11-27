import { asOwnerId, DomainError } from "@moneytrace/domain";
import { describe, expect, it } from "vitest";
import type { TipsFields, TipsRepository } from "../ports/tips-repository";

const alice = asOwnerId("alice");
const bob = asOwnerId("bob");

export const SAMPLE_TIPS: TipsFields = {
  month: "2026-11",
  status: "factsOnly",
  facts: [{ id: "unsorted", kind: "unsorted", amountMinor: 250000, headline: "৳2,500 isn't sorted yet", detail: "Sorting it shows where it went" }],
  advice: {},
  factsHash: "h1",
  generatedAtMs: 1,
  aiDay: null,
  aiFactsHash: null,
  adviceAtMs: null,
};

/** The same behaviour from the in-memory fake and the Postgres adapter. */
export function describeTipsRepositoryContract(name: string, make: () => Promise<TipsRepository>): void {
  describe(`tips (${name})`, () => {
    it("nothing stored reads as null", async () => {
      expect(await (await make()).get(alice)).toBeNull();
    });

    it("updates and reads back, the New tips count starting at zero", async () => {
      const repo = await make();
      let seen: unknown = "unset";
      const stored = await repo.update(alice, (current) => {
        seen = current;
        return SAMPLE_TIPS;
      });
      expect(seen).toBeNull();
      expect(stored).toEqual({ id: "current", ...SAMPLE_TIPS, forcedDay: null, forcedToday: 0 });
      expect(await repo.get(alice)).toEqual(stored);
    });

    it("a later update keeps the New tips count", async () => {
      const repo = await make();
      await repo.update(alice, () => SAMPLE_TIPS);
      await repo.claimForced(alice, "2026-11-27", 3);
      await repo.update(alice, () => ({ ...SAMPLE_TIPS, status: "ready", advice: { unsorted: "Sort a few shops each week." } }));
      expect(await repo.get(alice)).toMatchObject({ status: "ready", forcedDay: "2026-11-27", forcedToday: 1 });
    });

    it("an update that returns null writes nothing and gives back what is stored", async () => {
      const repo = await make();
      await repo.update(alice, () => SAMPLE_TIPS);
      expect(await repo.update(alice, () => null)).toMatchObject({ factsHash: "h1" });
      expect(await repo.update(bob, () => null)).toBeNull();
      expect(await repo.get(bob)).toBeNull();
    });

    it("concurrent updates each see the one before (no lost write)", async () => {
      const repo = await make();
      await repo.update(alice, () => SAMPLE_TIPS);
      const ids = ["a", "b", "c", "d"];
      await Promise.all(ids.map((id) => repo.update(alice, (current) => ({ ...SAMPLE_TIPS, advice: { ...(current?.advice ?? {}), [id]: `Advice ${id}.` } }))));
      expect(Object.keys((await repo.get(alice))?.advice ?? {}).sort()).toEqual(ids);
    });

    it("counts New tips up to the day's limit, and starts again the next day", async () => {
      const repo = await make();
      await repo.update(alice, () => SAMPLE_TIPS);
      const day = [1, 2, 3, 4].map(() => repo.claimForced(alice, "2026-11-27", 3));
      expect(await Promise.all(day)).toEqual(expect.arrayContaining([1, 2, 3, null]));
      expect(await repo.claimForced(alice, "2026-11-28", 3)).toBe(1);
    });

    it("concurrent New tips never pass the limit", async () => {
      const repo = await make();
      await repo.update(alice, () => SAMPLE_TIPS);
      const claims = await Promise.all([1, 2, 3, 4, 5].map(() => repo.claimForced(alice, "2026-11-27", 3)));
      expect(claims.filter((c) => c !== null).sort()).toEqual([1, 2, 3]);
    });

    it("a claim without a document is refused", async () => {
      await expect((await make()).claimForced(alice, "2026-11-27", 3)).rejects.toBeInstanceOf(DomainError);
    });

    it("one owner never sees another's tips", async () => {
      const repo = await make();
      await repo.update(alice, () => SAMPLE_TIPS);
      expect(await repo.get(bob)).toBeNull();
    });
  });
}
