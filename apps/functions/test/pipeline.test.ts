import { beforeAll, describe, expect, it } from "vitest";
import corpus from "../../../fixtures/sms/corpus.json";
import { localBackend, type Reply, type User } from "./support/local-api";

/** The SMS pipeline end to end through the real `/api` on Postgres in-process (CR-010; was the Firebase emulator). */
const { db, call, signUp } = await localBackend();

const smsOf = (needle: string): string => {
  const e = corpus.find((c) => c.text.includes(needle));
  if (e === undefined) throw new Error(needle);
  return e.text;
};
const WITHDRAWAL_SMS = smsOf("EXAMPLE ATM DHAKA");
const CARD_PURCHASE_SMS = smsOf("EXAMPLE PHARMA");
const CARD_PAYMENT_SMS = smsOf("BRAC Bank Credit Card");

function unwrap(r: Reply): Record<string, unknown> {
  if (r.result === undefined) throw new Error(`call failed: ${JSON.stringify(r)}`);
  return r.result;
}

const OPENING_AT = Date.parse("2026-01-01T00:00:00Z");

/** A user with a BRAC bank account and credit card, set up through the real callables. */
async function setUp(label: string) {
  const user = await signUp(label);
  unwrap(await call("bootstrapUser", user, {}));
  const account = async (kind: string, name: string) =>
    String(unwrap(await call("createAccount", user, { kind, name, currency: "BDT" }))["accountId"]);
  const bank = await account("bank", "BRAC");
  const card = await account("creditLiability", "BRAC card");
  const wallet = await account("cash", "My wallet");
  for (const [accountId, maskedIdentifier, type] of [
    [bank, "8888", "bankAccount"],
    [card, "9999", "creditCard"],
  ]) {
    unwrap(
      await call("createPaymentInstrument", user, {
        accountId,
        provider: "brac",
        maskedIdentifier,
        type,
      }),
    );
  }
  unwrap(
    await call("recordOpeningBalance", user, {
      accountId: bank,
      amountMinor: 10_000_000,
      currency: "BDT",
      effectiveAtMs: OPENING_AT,
    }),
  );
  return { user, bank, card, wallet };
}

const events = (uid: string) => db.collection(`users/${uid}/sourceEvents`);

async function waitForStatus(uid: string, id: string, status: string) {
  const deadline = Date.now() + 45_000;
  let last: unknown;
  while (Date.now() < deadline) {
    const snap = await events(uid).doc(id).get();
    last = snap.get("status");
    if (last === status && snap.get("claim") === null) return snap;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`event ${id} stayed at ${String(last)}, wanted ${status}`);
}

const balanceOf = async (uid: string, accountId: string): Promise<number> => {
  const snap = await db.doc(`users/${uid}/balances/${accountId}`).get();
  return snap.exists ? (snap.get("debitMinusCreditMinor") as number) : 0;
};

let n = 0;
const submit = async (user: User, text: string) =>
  String(
    unwrap(await call("submitEvidence", user, { idempotencyKey: `k${String(++n)}`, text }))[
      "sourceEventId"
    ],
  );

describe("the SMS pipeline end to end", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await call("bootstrapUser", await signUp("warm"), {});
  }, 60_000);

  it("gate 25: paste a withdrawal SMS, then answer the question", async () => {
    const { user, bank, wallet } = await setUp("atm");
    const id = await submit(user, WITHDRAWAL_SMS);
    await waitForStatus(user.uid, id, "posted");
    expect(await balanceOf(user.uid, bank)).toBe(10_000_000 - 400_000);
    expect(await balanceOf(user.uid, "cash-unassigned")).toBe(400_000);
    const open = await db
      .collection(`users/${user.uid}/followUps`)
      .where("state", "==", "open")
      .get();
    expect(open.size).toBe(1);
    const [q] = open.docs;
    expect(q?.get("question")).toBe("You withdrew ৳4,000 from an ATM. Where did the cash go?");
    unwrap(
      await call("resolveFollowUp", user, {
        followUpId: q?.id,
        resolution: { kind: "destination", accountId: wallet },
      }),
    );
    expect(await balanceOf(user.uid, wallet)).toBe(400_000);
    expect(await balanceOf(user.uid, "cash-unassigned")).toBe(0);
    const expenses = await db
      .collection(`users/${user.uid}/ledgerEntries`)
      .where("accountKind", "==", "expense")
      .get();
    expect(expenses.size).toBe(0);
  });

  it("gate 26: a card purchase SMS, then a partial repayment SMS", async () => {
    const { user, bank, card } = await setUp("card");
    const id = await submit(user, CARD_PURCHASE_SMS);
    await waitForStatus(user.uid, id, "posted");
    expect(await balanceOf(user.uid, card)).toBe(-190_000);
    const payment = await submit(user, CARD_PAYMENT_SMS);
    await waitForStatus(user.uid, payment, "pending");
    unwrap(
      await call("confirmCandidate", user, {
        sourceEventId: payment,
        decision: "confirm",
        overrides: {
          destinationAccountId: bank,
          amountMinor: 100_000,
          occurredAtMs: Date.parse("2026-03-30T00:00:00Z"),
        },
      }),
    );
    await waitForStatus(user.uid, payment, "posted");
    expect(await balanceOf(user.uid, card)).toBe(-90_000);
    expect(await balanceOf(user.uid, bank)).toBe(10_000_000 - 100_000);
  });

  it("the same SMS twice posts once", async () => {
    const { user, card } = await setUp("twice");
    const first = await submit(user, CARD_PURCHASE_SMS);
    await waitForStatus(user.uid, first, "posted");
    const again = await call("submitEvidence", user, {
      idempotencyKey: "other-key",
      text: CARD_PURCHASE_SMS,
    });
    expect(unwrap(again)).toMatchObject({ sourceEventId: first, duplicate: true });
    expect(await balanceOf(user.uid, card)).toBe(-190_000);
  });

  it("a declined SMS is rejected with its reason, and nothing posts", async () => {
    const { user } = await setUp("declined");
    const id = await submit(user, "Your card transaction of BDT 500.00 at EXAMPLE was declined.");
    const snap = await waitForStatus(user.uid, id, "rejected");
    expect(snap.get("extraction.notFinancialReason")).toBe("declined");
    expect((await db.collection(`users/${user.uid}/ledgerEntries`).get()).size).toBe(2);
  });

  it("a cash note goes through the fake AI to a question, and never auto-posts", async () => {
    const { user } = await setUp("cash");
    const id = await submit(user, "paid 500 for rickshaw");
    const snap = await waitForStatus(user.uid, id, "pending");
    expect(snap.get("pendingReason")).toBe("awaitingClarification");
    expect(snap.get("candidate.amountMinor")).toBe(50_000);
    const usage = await db.collection(`users/${user.uid}/aiUsage`).get();
    expect(usage.size).toBe(1);
  });

  it("gate 34: with quota exhausted a cash note parks, a parsed SMS still posts", async () => {
    const { user, card } = await setUp("quota");
    const day = new Date().toISOString().slice(0, 10);
    await db.doc(`users/${user.uid}/quotaCounters/${day}`).set({
      window: day,
      reservedMicroUsd: 500_000,
      warnedAtMs: null,
      updatedAtMs: 1,
    });
    const note = await submit(user, "paid 500 for rickshaw");
    const parked = await waitForStatus(user.uid, note, "pending");
    expect(parked.get("pendingReason")).toBe("aiQuotaExhausted");
    const sms = await submit(user, CARD_PURCHASE_SMS);
    await waitForStatus(user.uid, sms, "posted");
    expect(await balanceOf(user.uid, card)).toBe(-190_000);

    await db.doc(`users/${user.uid}/quotaCounters/${day}`).delete();
    const retried = await call("retrySourceEvent", user, { sourceEventId: note });
    expect(retried.error).toBeUndefined();
    const after = await waitForStatus(user.uid, note, "pending");
    expect(after.get("pendingReason")).toBe("awaitingClarification");
  });

  it("rewriting a finished event does nothing", async () => {
    const { user, card } = await setUp("rewrite");
    const id = await submit(user, CARD_PURCHASE_SMS);
    const snap = await waitForStatus(user.uid, id, "posted");
    const version = snap.get("version") as number;
    await events(user.uid)
      .doc(id)
      .set(snap.data() ?? {});
    await new Promise((r) => setTimeout(r, 1500));
    expect((await events(user.uid).doc(id).get()).get("version")).toBe(version);
    expect(await balanceOf(user.uid, card)).toBe(-190_000);
  });

  it("two users pasting the same SMS each get their own transaction", async () => {
    const [a, b] = [await setUp("two-a"), await setUp("two-b")];
    const [ida, idb] = [
      await submit(a.user, CARD_PURCHASE_SMS),
      await submit(b.user, CARD_PURCHASE_SMS),
    ];
    await waitForStatus(a.user.uid, ida, "posted");
    await waitForStatus(b.user.uid, idb, "posted");
    expect(await balanceOf(a.user.uid, a.card)).toBe(-190_000);
    expect(await balanceOf(b.user.uid, b.card)).toBe(-190_000);
  });
});
