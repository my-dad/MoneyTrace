import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const PROJECT_ID = "demo-moneytrace";
const FUNCTIONS = `http://127.0.0.1:5001/${PROJECT_ID}/asia-south2`;
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake";

const fsHost = process.env["FIRESTORE_EMULATOR_HOST"];
if (fsHost === undefined) throw new Error("run through `firebase emulators:exec`");
const firestoreHost: string = fsHost;
process.env["METADATA_SERVER_DETECTION"] = "none";

const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));

type User = { uid: string; token: string };
type Reply = {
  status: number;
  result?: Record<string, unknown>;
  error?: { status: string; message: string };
};

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

async function call(name: string, user: User | null, data: unknown): Promise<Reply> {
  const res = await fetch(`${FUNCTIONS}/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(user === null ? {} : { authorization: `Bearer ${user.token}` }),
    },
    body: JSON.stringify({ data }),
  });
  const body = (await res.json()) as Omit<Reply, "status">;
  return { status: res.status, ...body };
}

function unwrap(r: Reply): Record<string, unknown> {
  if (r.result === undefined) throw new Error(`call failed: ${JSON.stringify(r)}`);
  return r.result;
}

async function listAccounts(uid: string) {
  return (await db.collection(`users/${uid}/accounts`).get()).docs;
}

async function balanceOf(uid: string, accountId: string): Promise<number> {
  const snap = await db.doc(`users/${uid}/balances/${accountId}`).get();
  return snap.exists ? (snap.get("debitMinusCreditMinor") as number) : 0;
}

async function countDocs(uid: string, collection: string): Promise<number> {
  return (await db.collection(`users/${uid}/${collection}`).get()).size;
}

const validAccount = { kind: "bank", name: "City", currency: "BDT" };

let alice: User;
let bob: User;

beforeAll(async () => {
  alice = await signUp("alice");
  bob = await signUp("bob");
}, 60_000);

beforeEach(async () => {
  const res = await fetch(
    `http://${firestoreHost}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`could not clear the emulator: ${String(res.status)}`);
});

/** The first call to each function cold-starts it in the emulator, which can exceed the 5s default. */
describe("authenticated callables", { timeout: 60_000 }, () => {
  it("another user's follow-up or transaction is not found", async () => {
    const other = await signUp("fu-other");
    const followUp = await call("resolveFollowUp", other, {
      followUpId: "nope",
      resolution: { kind: "notSureYet" },
    });
    expect(followUp.error?.status).toBe("NOT_FOUND");
    const tx = await call("correctTransaction", other, {
      idempotencyKey: "k",
      transactionId: "nope",
      rationale: "x",
    });
    expect(tx.error?.status).toBe("NOT_FOUND");
  });

  it("the cash count, adjustment and split callables require a token", async () => {
    for (const [name, data] of [
      ["recordReconciliation", { idempotencyKey: "k", countedMinor: 0, currency: "BDT" }],
      ["recordAdjustment", { reconciliationId: "recon-k", cause: "x" }],
      ["splitTransfer", { sourceEventId: "se1" }],
    ] as const) {
      const r = await call(name, null, data);
      expect(r.error?.status, name).toBe("UNAUTHENTICATED");
    }
  });

  it("a cash count opens a question without changing Cash, and Adjust moves Cash to the count", async () => {
    const user = await signUp("count");
    unwrap(await call("bootstrapUser", user, {}));
    unwrap(
      await call("recordOpeningBalance", user, {
        accountId: "cash-main",
        amountMinor: 300_000,
        currency: "BDT",
        effectiveAtMs: Date.parse("2026-01-01T00:00:00Z"),
      }),
    );
    const count = unwrap(
      await call("recordReconciliation", user, { idempotencyKey: "c1", countedMinor: 230_000, currency: "BDT" }),
    );
    expect(count).toMatchObject({ reconciliationId: "recon-c1", expectedMinor: 300_000, differenceMinor: -70_000, followUpId: "fu-recon-c1" });
    expect(await balanceOf(user.uid, "cash-main")).toBe(300_000);
    expect((await db.doc(`users/${user.uid}/followUps/fu-recon-c1`).get()).get("state")).toBe("open");

    const adjusted = unwrap(await call("recordAdjustment", user, { reconciliationId: "recon-c1", cause: "maybe lost" }));
    expect(adjusted).toMatchObject({ status: "recorded", countedMinor: 230_000, adjustmentMinor: 70_000 });
    expect(await balanceOf(user.uid, "cash-main")).toBe(230_000);
    expect((await db.doc(`users/${user.uid}/followUps/fu-recon-c1`).get()).get("state")).toBe("resolved");
    const again = await call("recordAdjustment", user, { reconciliationId: "recon-c1", cause: "maybe lost" });
    expect(again.result?.["status"]).toBe("alreadyRecorded");
    const notPaired = await call("splitTransfer", user, { sourceEventId: "nope" });
    expect(notPaired.error?.status).toBe("NOT_FOUND");
  });

  it("submitEvidence requires a token", async () => {
    const r = await call("submitEvidence", null, { idempotencyKey: "k", text: "paid 500" });
    expect(r.status).toBe(401);
    expect(r.error?.status).toBe("UNAUTHENTICATED");
  });

  it("an OTP is refused with its code and nothing is stored", async () => {
    const user = await signUp("otp");
    const r = await call("submitEvidence", user, {
      idempotencyKey: "k",
      text: "Your OTP is 482913",
    });
    expect(r.error?.status).toBe("FAILED_PRECONDITION");
    expect(r.error?.message).toBe("sensitiveEvidence");
    expect((await db.collection(`users/${user.uid}/sourceEvents`).get()).size).toBe(0);
    expect((await db.collection(`users/${user.uid}/idempotencyRecords`).get()).size).toBe(0);
  });

  it("another user's event is not found, and is left alone", async () => {
    const [owner, other] = [await signUp("ev-owner"), await signUp("ev-other")];
    const { sourceEventId } = unwrap(
      await call("submitEvidence", owner, { idempotencyKey: "k", text: "spent 500 on tea" }),
    );
    for (const name of ["confirmCandidate", "retrySourceEvent", "cancelSourceEvent"]) {
      const data =
        name === "confirmCandidate" ? { sourceEventId, decision: "reject" } : { sourceEventId };
      expect((await call(name, other, data)).error?.status, name).toBe("NOT_FOUND");
    }
    expect(
      (await db.doc(`users/${owner.uid}/sourceEvents/${String(sourceEventId)}`).get()).exists,
    ).toBe(true);
  });

  it("bootstrap creates the system cash wallet", async () => {
    const user = await signUp("wallet");
    unwrap(await call("bootstrapUser", user, {}));
    const wallet = await db.doc(`users/${user.uid}/accounts/cash-unassigned`).get();
    expect(wallet.get("kind")).toBe("cash");
  });

  it("creates a payment instrument, and treats another user's account as not found", async () => {
    const [owner, other] = [await signUp("owner"), await signUp("other")];
    const { accountId } = unwrap(
      await call("createAccount", owner, { kind: "bank", name: "City", currency: "BDT" }),
    );
    const request = { accountId, provider: "ucb", maskedIdentifier: "1234", type: "debitCard" };
    const { instrumentId } = unwrap(await call("createPaymentInstrument", owner, request));
    expect(typeof instrumentId).toBe("string");
    const refused = await call("createPaymentInstrument", other, request);
    expect(refused.error?.status).toBe("NOT_FOUND");
    const full = await call("createPaymentInstrument", owner, {
      ...request,
      maskedIdentifier: "4111111111111111",
    });
    expect(full.error?.status).toBe("INVALID_ARGUMENT");
    expect((await db.collection(`users/${owner.uid}/paymentInstruments`).get()).size).toBe(1);
  });

  it("rejects a request with no token", async () => {
    const res = await call("createAccount", null, validAccount);
    expect(res.status).toBe(401);
    expect(res.error?.status).toBe("UNAUTHENTICATED");
    expect(await listAccounts(alice.uid)).toHaveLength(0);
  });

  it("rejects a request with a garbage token", async () => {
    const res = await call("createAccount", { uid: "x", token: "not-a-token" }, validAccount);
    expect(res.status).toBe(401);
    expect(res.error?.status).toBe("UNAUTHENTICATED");
  });

  it("creates an account for the verified user only", async () => {
    const res = await call("createAccount", alice, validAccount);
    expect(res.status).toBe(200);
    const { accountId } = unwrap(res) as { accountId: string };
    const docs = await listAccounts(alice.uid);
    expect(docs.map((d) => d.id)).toEqual([accountId]);
    expect(await listAccounts(bob.uid)).toHaveLength(0);
  });

  it("rejects a forged ownerId in the body", async () => {
    const res = await call("createAccount", alice, { ...validAccount, ownerId: bob.uid });
    expect(res.status).toBe(400);
    expect(res.error?.status).toBe("INVALID_ARGUMENT");
    expect(await listAccounts(bob.uid)).toHaveLength(0);
    expect(await listAccounts(alice.uid)).toHaveLength(0);
  });

  it("treats another user account id as not found and changes nothing", async () => {
    const { accountId } = unwrap(await call("createAccount", alice, validAccount)) as {
      accountId: string;
    };
    const res = await call("recordOpeningBalance", bob, {
      accountId,
      amountMinor: 100,
      currency: "BDT",
      effectiveAtMs: 1,
    });
    expect(res.status).toBe(404);
    expect(res.error?.status).toBe("NOT_FOUND");
    expect(await balanceOf(alice.uid, accountId)).toBe(0);
    expect(await countDocs(alice.uid, "transactions")).toBe(0);
    expect(await countDocs(bob.uid, "transactions")).toBe(0);
    expect(await countDocs(bob.uid, "balances")).toBe(0);
  });

  it.each([12.5, "100", 2 ** 53])("rejects amount %s with no write", async (amountMinor) => {
    const { accountId } = unwrap(await call("createAccount", alice, validAccount)) as {
      accountId: string;
    };
    const res = await call("recordOpeningBalance", alice, {
      accountId,
      amountMinor,
      currency: "BDT",
      effectiveAtMs: 1,
    });
    expect(res.status).toBe(400);
    expect(res.error?.status).toBe("INVALID_ARGUMENT");
    expect(await countDocs(alice.uid, "transactions")).toBe(0);
    expect(await balanceOf(alice.uid, accountId)).toBe(0);
  });

  it("records an opening balance, repeats harmlessly, and rejects a changed one", async () => {
    const { accountId } = unwrap(await call("createAccount", alice, validAccount)) as {
      accountId: string;
    };
    const body = { accountId, amountMinor: 250_000, currency: "BDT", effectiveAtMs: 1_000 };

    const first = unwrap(await call("recordOpeningBalance", alice, body));
    expect(first["status"]).toBe("recorded");
    expect(await balanceOf(alice.uid, accountId)).toBe(250_000);

    const again = unwrap(await call("recordOpeningBalance", alice, body));
    expect(again).toEqual({ ...first, status: "alreadyRecorded" });
    expect(await balanceOf(alice.uid, accountId)).toBe(250_000);

    const changed = await call("recordOpeningBalance", alice, { ...body, amountMinor: 999_999 });
    expect(changed.status).toBe(409);
    expect(changed.error?.status).toBe("ALREADY_EXISTS");

    const otherDate = await call("recordOpeningBalance", alice, { ...body, effectiveAtMs: 2_000 });
    expect(otherDate.error?.status).toBe("ALREADY_EXISTS");

    expect(await balanceOf(alice.uid, accountId)).toBe(250_000);
    expect(await countDocs(alice.uid, "transactions")).toBe(1);
  });

  it("bootstrapUser is idempotent and keeps changed settings", async () => {
    const first = await call("bootstrapUser", alice, {});
    expect(unwrap(first)).toEqual({ created: true });
    const ref = db.doc(`users/${alice.uid}`);
    const profile = (await ref.get()).data();
    expect(profile?.["baseCurrency"]).toBe("BDT");
    expect(profile?.["reportingCycle"]).toEqual({ kind: "calendarMonth" });

    await ref.update({ reportingCycle: { kind: "salaryCycle", startDay: 25 } });
    expect(unwrap(await call("bootstrapUser", alice, {}))).toEqual({ created: false });
    expect((await ref.get()).get("reportingCycle")).toEqual({ kind: "salaryCycle", startDay: 25 });
    expect((await db.doc(`users/${bob.uid}`).get()).exists).toBe(false);
  });
});
