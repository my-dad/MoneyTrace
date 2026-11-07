import { asAccountId, asOwnerId, type RealAccountKind } from "@moneytrace/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryPaymentInstruments } from "../testing/in-memory-payment-instruments";
import { createWorld } from "../testing/world";
import { CreatePaymentInstrument } from "./create-payment-instrument";

const alice = asOwnerId("alice");
const bob = asOwnerId("bob");
const code = (c: string): Error => expect.objectContaining({ code: c }) as Error;

let w: ReturnType<typeof createWorld>;
let instruments: InMemoryPaymentInstruments;
let uc: CreatePaymentInstrument;

async function account(id: string, kind: RealAccountKind, owner = alice) {
  await w.accounts.create(owner, {
    id: asAccountId(id),
    kind,
    name: id,
    currency: "BDT",
    status: "active",
    createdAtMs: 1,
  });
}

beforeEach(async () => {
  w = createWorld();
  instruments = new InMemoryPaymentInstruments();
  uc = new CreatePaymentInstrument({
    accounts: w.accounts,
    instruments,
    ids: w.ids,
    clock: w.clock,
  });
  await account("bank", "bank");
  await account("card", "creditLiability");
});

const base = { ownerId: alice, provider: "ucb" };

describe("CreatePaymentInstrument", () => {
  it("stores a debit card on a bank account", async () => {
    const { instrumentId } = await uc.execute({
      ...base,
      accountId: "bank",
      maskedIdentifier: "1234",
      type: "debitCard",
    });
    expect(await instruments.findForCandidate(alice, { provider: "ucb", mask: "1234" })).toEqual([
      expect.objectContaining({ id: instrumentId, linkedAccountId: "bank", kind: "debitCard" }),
    ]);
  });

  it.each(["4111111111111111", "12345", "12", "12a4", ""])(
    "refuses %j as a card mask",
    async (mask) => {
      await expect(
        uc.execute({ ...base, accountId: "bank", maskedIdentifier: mask, type: "debitCard" }),
      ).rejects.toThrow(code("invalidIntent"));
      expect(await instruments.findForCandidate(alice, { provider: "ucb", mask: "1111" })).toEqual(
        [],
      );
    },
  );

  it("accepts Trust Bank's 3-digit ending", async () => {
    await uc.execute({
      ...base,
      provider: "trustbank",
      accountId: "bank",
      maskedIdentifier: "095",
      type: "bankAccount",
    });
    expect(
      await instruments.findForCandidate(alice, { provider: "trustbank", mask: "095" }),
    ).toHaveLength(1);
  });

  it.each([
    ["debitCard", "card"],
    ["bankAccount", "card"],
    ["mobileWallet", "card"],
    ["creditCard", "bank"],
  ] as const)("refuses a %s on a %s account", async (type, accountId) => {
    await expect(
      uc.execute({
        ...base,
        accountId,
        maskedIdentifier: type === "mobileWallet" ? "" : "1234",
        type,
      }),
    ).rejects.toThrow(code("invalidIntent"));
  });

  it("a wallet has no digits", async () => {
    await uc.execute({
      ...base,
      provider: "bkash",
      accountId: "bank",
      maskedIdentifier: "",
      type: "mobileWallet",
    });
    expect(await instruments.findForCandidate(alice, { provider: "bkash" })).toHaveLength(1);
    await expect(
      uc.execute({
        ...base,
        provider: "bkash",
        accountId: "bank",
        maskedIdentifier: "1234",
        type: "mobileWallet",
      }),
    ).rejects.toThrow(code("invalidIntent"));
  });

  it("another owner's account is not found", async () => {
    await account("bobs", "bank", bob);
    await expect(
      uc.execute({ ...base, accountId: "bobs", maskedIdentifier: "1234", type: "debitCard" }),
    ).rejects.toThrow(code("accountInvalid"));
  });
});
