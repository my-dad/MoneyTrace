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
