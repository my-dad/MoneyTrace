import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";
import corpus from "../../../fixtures/sms/corpus.json";
import { COMMAND_HANDLERS } from "../src/callable/registry";

/**
 * Gate 35 evidence: another user, holding Alice's real ids, cannot read or change her data
 * through any callable. Alice's whole document tree is compared before and after.
 */

const PROJECT_ID = "demo-moneytrace";
const FUNCTIONS = `http://127.0.0.1:5001/${PROJECT_ID}/asia-south2`;
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake";
process.env["METADATA_SERVER_DETECTION"] = "none";

const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));

type User = { uid: string; token: string };
type Reply = { result?: Record<string, unknown>; error?: { status: string; message: string } };

const WITHDRAWAL_SMS = corpus.find((c) => c.text.includes("EXAMPLE ATM DHAKA"))?.text ?? "";
const OPENING_AT = Date.parse("2026-01-01T00:00:00Z");

async function signUp(label: string): Promise<User> {
  const res = await fetch(AUTH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `${label}-${crypto.randomUUID()}@example.test`,
      password: "correct-horse-battery",
      returnSecureToken: true,
    }),
  });
  const body = (await res.json()) as { idToken: string; localId: string };
  return { uid: body.localId, token: body.idToken };
}

async function call(name: string, user: User, data: unknown): Promise<Reply> {
  const res = await fetch(`${FUNCTIONS}/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
    body: JSON.stringify({ data }),
  });
  return (await res.json()) as Reply;
}

function unwrap(r: Reply): Record<string, unknown> {
  if (r.result === undefined) throw new Error(`call failed: ${JSON.stringify(r)}`);
  return r.result;
}

let keys = 0;
const key = () => `x${String(++keys)}`;

async function waitForStatus(uid: string, id: string, status: string) {
  const deadline = Date.now() + 45_000;
  let last: unknown;
  while (Date.now() < deadline) {
    const snap = await db.doc(`users/${uid}/sourceEvents/${id}`).get();
    last = snap.get("status");
    if (last === status && snap.get("claim") === null) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`event ${id} stayed at ${String(last)}, wanted ${status}`);
}

/** A user with a bank (with an instrument and opening balance), a wallet and a family holder. */
async function setUp(label: string) {
  const user = await signUp(label);
  unwrap(await call("bootstrapUser", user, {}));
  const account = async (kind: string, name: string) =>
    String(unwrap(await call("createAccount", user, { kind, name, currency: "BDT" }))["accountId"]);
  const bank = await account("bank", "BRAC");
  const wallet = await account("cash", "My wallet");
  const family = await account("familyCash", "Ammu");
  unwrap(
    await call("createPaymentInstrument", user, { accountId: bank, provider: "brac", maskedIdentifier: "8888", type: "bankAccount" }),
  );
  const opening = unwrap(
    await call("recordOpeningBalance", user, { accountId: bank, amountMinor: 10_000_000, currency: "BDT", effectiveAtMs: OPENING_AT }),
  );
  return { user, bank, wallet, family, openingTx: String(opening["transactionId"]) };
}

/** Every document under users/{uid}, with its data, so any change at all is visible. */
async function snapshotTree(uid: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const root = db.doc(`users/${uid}`);
  out[root.path] = (await root.get()).data() ?? null;
  for (const collection of await root.listCollections()) {
    for (const doc of (await collection.get()).docs) out[doc.ref.path] = doc.data();
  }
  return out;
}

type Alice = Awaited<ReturnType<typeof setUp>> & {
  eventId: string;
  followUpId: string;
  withdrawalTx: string;
  reconciliationId: string;
};
type Bob = Awaited<ReturnType<typeof setUp>> & { followUpId: string; pendingEventId: string };
type Case = { name: string; data: (alice: Alice, bob: Bob) => unknown };

/**
 * Callables that take no id of another user act only on the caller's own data; for them the
 * check is that Alice's tree is untouched. The rest must refuse Alice's ids.
 */
const OWN_DATA_ONLY: Case[] = [
  { name: "bootstrapUser", data: () => ({}) },
  { name: "createAccount", data: () => ({ kind: "bank", name: "Bob bank", currency: "BDT" }) },
  { name: "updateSettings", data: () => ({ timezone: "Asia/Dhaka" }) },
  { name: "submitEvidence", data: () => ({ idempotencyKey: key(), text: "paid 300 for tea" }) },
  { name: "recordReconciliation", data: () => ({ idempotencyKey: key(), countedMinor: 0, currency: "BDT" }) },
];

const MUST_REFUSE: Case[] = [
  // Firebase has no account deletion (it ships on Supabase, CR-010); its /api tests prove Bob only ever erases Bob.
  { name: "requestAccountDeletion", data: () => ({ confirmation: "DELETE MY ACCOUNT" }) },
  { name: "createPaymentInstrument", data: (a) => ({ accountId: a.bank, provider: "brac", maskedIdentifier: "1234", type: "bankAccount" }) },
  { name: "recordOpeningBalance", data: (a) => ({ accountId: a.wallet, amountMinor: 5_000, currency: "BDT", effectiveAtMs: OPENING_AT }) },
  { name: "resolveFollowUp", data: (a) => ({ followUpId: a.followUpId, resolution: { kind: "notSureYet" } }) },
  { name: "resolveFollowUp", data: (a, b) => ({ followUpId: b.followUpId, resolution: { kind: "destination", accountId: a.wallet } }) },
  { name: "snoozeFollowUp", data: (a) => ({ followUpId: a.followUpId, untilMs: Date.now() + 3_600_000 }) },
  {
    name: "recordCustodyTransfer",
    data: (a, b) => ({ idempotencyKey: key(), fromAccountId: b.wallet, toAccountId: a.family, amountMinor: 1_000, currency: "BDT", holderName: "Ammu", occurredAtMs: Date.now() }),
  },
  {
    name: "recordCustodyTransfer",
    data: (a, b) => ({ idempotencyKey: key(), fromAccountId: a.wallet, toAccountId: b.family, amountMinor: 1_000, currency: "BDT", holderName: "Ammu", occurredAtMs: Date.now() }),
  },
  { name: "correctTransaction", data: (a) => ({ idempotencyKey: key(), transactionId: a.withdrawalTx, rationale: "not mine" }) },
  { name: "correctTransaction", data: (a) => ({ idempotencyKey: key(), transactionId: a.openingTx, replacement: { amountMinor: 1, currency: "BDT" }, rationale: "x" }) },
  { name: "confirmCandidate", data: (a) => ({ sourceEventId: a.eventId, decision: "reject" }) },
  { name: "confirmCandidate", data: (a, b) => ({ sourceEventId: b.pendingEventId, decision: "confirm", overrides: { kind: "purchase", accountId: a.wallet, category: "transport" } }) },
  { name: "retrySourceEvent", data: (a) => ({ sourceEventId: a.eventId }) },
  { name: "cancelSourceEvent", data: (a) => ({ sourceEventId: a.eventId }) },
  { name: "answerQuestion", data: (a) => ({ sourceEventId: a.eventId, answer: "paid from it" }) },
  { name: "recordAdjustment", data: (a) => ({ reconciliationId: a.reconciliationId, cause: "not mine" }) },
  { name: "splitTransfer", data: (a) => ({ sourceEventId: a.eventId }) },
];

/** The callables index.ts exports: the ones built from ./callable/ modules. */
/** Every client command the backends serve (the registry both Firebase and `/api` read). */
function exportedCallables(): string[] {
  return Object.keys(COMMAND_HANDLERS).sort();
}

describe("cross-user isolation (gate 35)", { timeout: 180_000 }, () => {
  let alice: Alice;
  let bob: Bob;

  beforeAll(async () => {
    const a = await setUp("iso-alice");
    const eventId = String(unwrap(await call("submitEvidence", a.user, { idempotencyKey: key(), text: WITHDRAWAL_SMS }))["sourceEventId"]);
    await waitForStatus(a.user.uid, eventId, "posted");
    const event = await db.doc(`users/${a.user.uid}/sourceEvents/${eventId}`).get();
    const withdrawalTx = String(event.get("transactionId") ?? `txn-${eventId}`);
    const aliceFollowUps = await db.collection(`users/${a.user.uid}/followUps`).get();
    const followUpId = aliceFollowUps.docs[0]?.id ?? "";
    // A cash count that differs, so Alice has an open count Bob can try to adjust.
    const count = unwrap(await call("recordReconciliation", a.user, { idempotencyKey: key(), countedMinor: 1, currency: "BDT" }));
    alice = { ...a, eventId, withdrawalTx, followUpId, reconciliationId: String(count["reconciliationId"]) };

    const b = await setUp("iso-bob");
    const bobWithdrawal = String(unwrap(await call("submitEvidence", b.user, { idempotencyKey: key(), text: WITHDRAWAL_SMS }))["sourceEventId"]);
    await waitForStatus(b.user.uid, bobWithdrawal, "posted");
    const bobFollowUps = await db.collection(`users/${b.user.uid}/followUps`).get();
    const pendingEventId = String(unwrap(await call("submitEvidence", b.user, { idempotencyKey: key(), text: "paid 500 for rickshaw" }))["sourceEventId"]);
    await waitForStatus(b.user.uid, pendingEventId, "pending");
    bob = { ...b, pendingEventId, followUpId: bobFollowUps.docs[0]?.id ?? "" };
    expect(alice.followUpId).not.toBe("");
    expect(bob.followUpId).not.toBe("");
  }, 180_000);

  it("covers every exported callable", () => {
    const covered = [...new Set([...OWN_DATA_ONLY, ...MUST_REFUSE].map((c) => c.name))].sort();
    expect(covered).toEqual(exportedCallables());
  });

  it("refuses Alice's ids and leaves her data byte-for-byte unchanged", async () => {
    const before = await snapshotTree(alice.user.uid);
    expect(Object.keys(before).length).toBeGreaterThan(10);

    for (const c of MUST_REFUSE) {
      const reply = await call(c.name, bob.user, c.data(alice, bob));
      expect(reply.result, `${c.name} should refuse ${JSON.stringify(c.data(alice, bob))}`).toBeUndefined();
      expect(["NOT_FOUND", "FAILED_PRECONDITION"], `${c.name}: ${JSON.stringify(reply.error)}`).toContain(reply.error?.status);
    }
    for (const c of OWN_DATA_ONLY) {
      expect((await call(c.name, bob.user, c.data(alice, bob))).error, c.name).toBeUndefined();
    }
    // Let any trigger Bob's calls started finish before comparing.
    await new Promise((r) => setTimeout(r, 2_000));

    expect(await snapshotTree(alice.user.uid)).toEqual(before);
  });
});
