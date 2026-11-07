import {
  asAccountId,
  asOwnerId,
  asSourceEventId,
  type CandidateTransaction,
} from "@moneytrace/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { createProviderWorld } from "../testing/fake-provider";
import { InMemoryAccountRepository } from "../testing/in-memory-ledger";
import { TestHasher } from "../testing/fakes";
import { CancelSourceEvent } from "./cancel-source-event";
import { ConfirmCandidate } from "./confirm-candidate";
import { IntakeEvidence } from "./intake-evidence";
import { RetrySourceEvent } from "./retry-source-event";

const alice = asOwnerId("alice");
const bob = asOwnerId("bob");
const code = (c: string): Error => expect.objectContaining({ code: c }) as Error;
const SMS =
  "TK 4,000.00 withdrawn from A/C#12345**8888 on 29-03-26 @07:45 PM from EXAMPLE ATM DHAKA BD. Balance TK 14,000.40. BRAC Bank.";
const candidate: CandidateTransaction = {
  kind: "unclassifiedCredit",
  amountMinor: 5000,
  currency: "BDT",
  occurredAtMs: 1,
};

let w: ReturnType<typeof createProviderWorld>;
let accounts: InMemoryAccountRepository;
let intake: IntakeEvidence;
let confirm: ConfirmCandidate;
let retry: RetrySourceEvent;
let cancel: CancelSourceEvent;

const submit = (text: string, key = "k1", owner = alice) =>
  intake.execute({ ownerId: owner, idempotencyKey: key, text });

/** Drives an event to `pending` at the decide stage, as the pipeline would. */
async function parkAtDecide(
  owner = alice,
  reason: "awaitingClarification" | "aiQuotaExhausted" = "awaitingClarification",
) {
  const { sourceEventId } = await submit("spent 500 on rickshaw", "park", owner);
  const id = asSourceEventId(sourceEventId);
  const claimed = await w.sourceEvents.claim(owner, id, "normalize", "w", w.clock.nowMs());
  if (claimed.status !== "claimed") throw new Error("not claimed");
  await w.sourceEvents.commitStage(owner, claimed.claim, {
    nextStatus: "pending",
    pendingReason: reason,
    outputs: [],
    eventPatch: { candidate },
  });
  return id;
}

beforeEach(async () => {
  w = createProviderWorld();
  accounts = new InMemoryAccountRepository();
  const clock = w.clock;
  const sourceEvents = w.sourceEvents;
  intake = new IntakeEvidence({
    sourceEvents,
    hasher: new TestHasher(),
    ids: w.ids,
    clock,
    logger: w.logger,
  });
  confirm = new ConfirmCandidate({ sourceEvents, accounts, clock });
  retry = new RetrySourceEvent({ sourceEvents, retryProvider: w.retry(), clock });
  cancel = new CancelSourceEvent({ sourceEvents, clock });
  await accounts.create(alice, {
    id: asAccountId("bank"),
    kind: "bank",
    name: "Bank",
    currency: "BDT",
    status: "active",
    createdAtMs: 1,
  });
});

describe("IntakeEvidence", () => {
  it.each(["Your OTP is 482913", "Your PIN is 4821", "Card 4111 1111 1111 1111 paid"])(
    "refuses %s, and stores and logs nothing",
    async (text) => {
      await expect(submit(text)).rejects.toThrow(code("sensitiveEvidence"));
      expect(w.sourceEvents.purgeCandidates(Number.MAX_SAFE_INTEGER, 10)).toEqual([]);
      expect(await w.sourceEvents.get(alice, asSourceEventId("id-1"))).toBeNull();
      expect(JSON.stringify(w.logger.events)).not.toMatch(/482913|4821|4111/);
    },
  );

  it("refuses blank text", async () => {
    await expect(submit("   ")).rejects.toThrow(code("invalidIntent"));
  });

  it("creates an event with masked text, and an SMS type when a parser recognizes it", async () => {
    const r = await submit(SMS);
    expect(r).toMatchObject({ status: "received", duplicate: false });
    expect(await w.sourceEvents.get(alice, asSourceEventId(r.sourceEventId))).toMatchObject({
      sourceType: "sms",
      retainedText: SMS,
    });
  });

  it("a cash note is a chat event", async () => {
    const r = await submit("spent 500 on rickshaw");
    expect(await w.sourceEvents.get(alice, asSourceEventId(r.sourceEventId))).toMatchObject({
      sourceType: "chat",
    });
  });

  it("stored text has account digits masked", async () => {
    const r = await submit("paid 500 from A/C 1234567890");
    expect(await w.sourceEvents.get(alice, asSourceEventId(r.sourceEventId))).toMatchObject({
      retainedText: "paid 500 from A/C **7890",
    });
  });

  it("the same SMS pasted twice returns duplicate with the first event", async () => {
    const first = await submit(SMS, "k1");
    expect(await submit(SMS, "k2")).toEqual({
      sourceEventId: first.sourceEventId,
      status: "received",
      duplicate: true,
    });
  });

  it("a retried key with the same text is a duplicate", async () => {
    const first = await submit(SMS, "k1");
    expect(await submit(SMS, "k1")).toMatchObject({
      sourceEventId: first.sourceEventId,
      duplicate: true,
    });
  });

  it("a reused key with changed text is a conflict", async () => {
    await submit(SMS, "k1");
    await expect(submit("spent 500 on rickshaw", "k1")).rejects.toThrow(
      code("idempotencyConflict"),
    );
  });

  it("two owners pasting the same SMS each get their own event", async () => {
    const a = await submit(SMS, "k1", alice);
    const b = await submit(SMS, "k1", bob);
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(false);
  });
});

describe("ConfirmCandidate", () => {
  it("reject ends as rejected", async () => {
    const id = await parkAtDecide();
    await expect(
      confirm.execute({ ownerId: alice, sourceEventId: id, decision: "reject" }),
    ).resolves.toEqual({ status: "rejected" });
    expect(await w.sourceEvents.get(alice, id)).toMatchObject({ status: "rejected" });
  });

  it("link ends as linkedAsDuplicate", async () => {
    const id = await parkAtDecide();
    await expect(
      confirm.execute({ ownerId: alice, sourceEventId: id, decision: "link" }),
    ).resolves.toEqual({ status: "linked" });
    expect(await w.sourceEvents.get(alice, id)).toMatchObject({ status: "linkedAsDuplicate" });
  });

  it("confirm applies overrides, records userConfirmed, and reopens", async () => {
    const id = await parkAtDecide();
    await expect(
      confirm.execute({
        ownerId: alice,
        sourceEventId: id,
        decision: "confirm",
        overrides: {
          kind: "income",
          accountId: "bank",
          amountMinor: 700,
          currency: "BDT",
          occurredAtMs: 9,
          category: "salary",
        },
      }),
    ).resolves.toEqual({ status: "pending" });
    expect(await w.sourceEvents.get(alice, id)).toMatchObject({
      status: "received",
      userConfirmed: true,
      resolvedAccountId: "bank",
      candidate: { kind: "income", amountMinor: 700, occurredAtMs: 9, category: "salary" },
    });
  });

  it("keeps the original evidence", async () => {
    const id = await parkAtDecide();
    await confirm.execute({
      ownerId: alice,
      sourceEventId: id,
      decision: "confirm",
      overrides: { amountMinor: 700 },
    });
    expect(await w.sourceEvents.get(alice, id)).toMatchObject({
      retainedText: "spent 500 on rickshaw",
    });
  });

  it("refuses another owner's account in an override", async () => {
    const id = await parkAtDecide();
    await expect(
      confirm.execute({
        ownerId: alice,
        sourceEventId: id,
        decision: "confirm",
        overrides: { accountId: "not-mine" },
      }),
    ).rejects.toThrow(code("accountInvalid"));
    expect(await w.sourceEvents.get(alice, id)).toMatchObject({
      status: "pending",
      userConfirmed: false,
    });
  });

  it("refuses an event that is not waiting for clarification", async () => {
    const { sourceEventId } = await submit(SMS);
    await expect(
      confirm.execute({
        ownerId: alice,
        sourceEventId: asSourceEventId(sourceEventId),
        decision: "confirm",
      }),
    ).rejects.toThrow(code("invalidTransition"));
  });

  it("another owner's event is not found", async () => {
    const id = await parkAtDecide();
    await expect(
      confirm.execute({ ownerId: bob, sourceEventId: id, decision: "reject" }),
    ).rejects.toThrow(code("resourceNotFound"));
    expect(await w.sourceEvents.get(alice, id)).toMatchObject({ status: "pending" });
  });
});

describe("RetrySourceEvent", () => {
  it("reopens an event parked on quota, with no approval needed", async () => {
    const id = await parkAtDecide(alice, "aiQuotaExhausted");
    await expect(retry.execute({ ownerId: alice, sourceEventId: id })).resolves.toEqual({
      status: "received",
    });
  });

  it("refuses an event waiting for the user's answer", async () => {
    const id = await parkAtDecide();
    await expect(retry.execute({ ownerId: alice, sourceEventId: id })).rejects.toThrow(
      code("invalidTransition"),
    );
  });

  it("another owner's event is not found", async () => {
    const id = await parkAtDecide(alice, "aiQuotaExhausted");
    await expect(retry.execute({ ownerId: bob, sourceEventId: id })).rejects.toThrow(
      code("resourceNotFound"),
    );
  });
});

describe("CancelSourceEvent", () => {
  it("cancels a pending event", async () => {
    const id = await parkAtDecide();
    await expect(cancel.execute({ ownerId: alice, sourceEventId: id })).resolves.toEqual({
      status: "cancelled",
    });
    expect(await w.sourceEvents.get(alice, id)).toMatchObject({ status: "cancelled" });
  });

  it("is refused on an event still running or already finished", async () => {
    const { sourceEventId } = await submit(SMS);
    const id = asSourceEventId(sourceEventId);
    await expect(cancel.execute({ ownerId: alice, sourceEventId: id })).rejects.toThrow(
      code("invalidTransition"),
    );
    const parked = await parkAtDecide();
    await cancel.execute({ ownerId: alice, sourceEventId: parked });
    await expect(cancel.execute({ ownerId: alice, sourceEventId: parked })).rejects.toThrow(
      code("invalidTransition"),
    );
  });
});
