import { asAccountId, asOwnerId } from "@moneytrace/domain";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  PaymentInstrumentRecord,
  PaymentInstrumentRepository,
} from "../ports/payment-instrument-repository";

const alice = asOwnerId("alice");
const bob = asOwnerId("bob");

const instrument = (over: Partial<PaymentInstrumentRecord> = {}): PaymentInstrumentRecord => ({
  id: "i1",
  kind: "debitCard",
  provider: "ucb",
  maskedIdentifier: "1234",
  linkedAccountId: asAccountId("bank-1"),
  status: "active",
  createdAtMs: 1,
  ...over,
});

export function describePaymentInstrumentContract(
  name: string,
  make: () => Promise<PaymentInstrumentRepository>,
): void {
  describe(`${name} payment instrument contract`, () => {
    let repo: PaymentInstrumentRepository;
    beforeEach(async () => {
      repo = await make();
    });

    const ids = async (provider: string, mask?: string): Promise<string[]> =>
      (
        await repo.findForCandidate(alice, {
          provider,
          ...(mask === undefined ? {} : { mask }),
        })
      )
        .map((r) => r.id)
        .sort();

    it("finds an instrument by provider and ending", async () => {
      await repo.create(alice, instrument());
      expect(await ids("ucb", "1234")).toEqual(["i1"]);
    });

    it("the same ending at another provider does not match", async () => {
      await repo.create(alice, instrument());
      expect(await ids("brac", "1234")).toEqual([]);
    });

    it("returns all matches, so two accounts ending the same are ambiguous", async () => {
      await repo.create(alice, instrument());
      await repo.create(alice, instrument({ id: "i2" }));
      expect(await ids("ucb", "1234")).toEqual(["i1", "i2"]);
    });

    it("a 3-digit SMS mask matches a stored 4-digit ending as a suffix", async () => {
      await repo.create(alice, instrument());
      expect(await ids("ucb", "234")).toEqual(["i1"]);
    });

    it("a 3-digit stored ending matches a longer SMS mask", async () => {
      await repo.create(alice, instrument({ maskedIdentifier: "234" }));
      expect(await ids("ucb", "1234")).toEqual(["i1"]);
    });

    it("a different ending does not match", async () => {
      await repo.create(alice, instrument());
      expect(await ids("ucb", "9234")).toEqual([]);
    });

    it("a wallet matches on provider with no digits", async () => {
      await repo.create(
        alice,
        instrument({ kind: "mobileWallet", provider: "bkash", maskedIdentifier: "" }),
      );
      expect(await ids("bkash")).toEqual(["i1"]);
    });

    it("no mask does not match a card", async () => {
      await repo.create(alice, instrument());
      expect(await ids("ucb")).toEqual([]);
    });

    it("a closed instrument is not found", async () => {
      await repo.create(alice, instrument({ status: "closed" }));
      expect(await ids("ucb", "1234")).toEqual([]);
    });

    it("another owner's instrument is not found", async () => {
      await repo.create(bob, instrument());
      expect(await ids("ucb", "1234")).toEqual([]);
    });
  });
}
