import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import corpus from "../../../fixtures/sms/corpus.json";
import { pgliteStore } from "../../../packages/infrastructure/test/support/pglite";
import type { PgDocStore } from "@moneytrace/infrastructure";
import { createApiHandler, supabaseCallerVerifier } from "./api";
import type { Caller } from "./callable/access";
import { composeDeps } from "./composition";
import { asOwnerId } from "@moneytrace/domain";

const ORIGIN = "https://moneytrace.example";
const CRON = "cron-secret-123456";
const OPEN_ENV = { FUNCTIONS_EMULATOR: "true", MONEYTRACE_AI: "fake" };

let store: PgDocStore;
let reset: () => Promise<void>;
beforeAll(async () => {
  ({ store, reset } = await pgliteStore());
});
beforeEach(() => reset());

const google = (uid: string, email = `${uid}@example.com`): Caller => ({ uid, email, emailVerified: true, provider: "google" });

const deletedAuthUsers: string[] = [];
function api(env: Record<string, string> = OPEN_ENV) {
  const deps = composeDeps(store, env, {
    deleteAuthUser: (uid) => {
      deletedAuthUsers.push(uid);
      return Promise.resolve();
    },
  });
  const background: Promise<unknown>[] = [];
  const handle = createApiHandler({
    getDeps: () => deps,
    verifyCaller: (token) => Promise.resolve(token.startsWith("user:") ? google(token.slice(5)) : undefined),
    cronSecret: CRON,
    allowedOrigins: [ORIGIN],
    background: (p) => background.push(p),
    nowMs: () => Date.now(),
  });
  const send = async (body: unknown, headers: Record<string, string> = {}) => {
    const res = await handle(
      new Request("https://x/functions/v1/api", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
    return { status: res.status, body: (await res.json()) as { result?: Record<string, unknown>; error?: { code: string; message: string } } };
  };
  const call = async (uid: string, command: string, data: unknown = {}) => send({ command, data }, { authorization: `Bearer user:${uid}` });
  const ok = async (uid: string, command: string, data: unknown = {}) => {
    const r = await call(uid, command, data);
    if (r.status !== 200 || r.body.result === undefined) throw new Error(`${command} failed: ${JSON.stringify(r)}`);
    return r.body.result;
  };
  const settle = async () => {
    while (background.length > 0) await background.shift();
  };
  return { handle, send, call, ok, settle };
}

describe("/api gate", () => {
  it("refuses a call without a token, and an unknown or inherited command name", async () => {
    const { send, call } = api();
    expect(await send({ command: "bootstrapUser", data: {} })).toEqual({ status: 401, body: { error: { code: "unauthenticated", message: "unauthenticated" } } });
    expect((await send({ command: "bootstrapUser", data: {} }, { authorization: "Bearer forged" })).status).toBe(401);
    expect((await call("alice", "dropDatabase")).body.error?.code).toBe("not-found");
    expect((await call("alice", "toString")).body.error?.code).toBe("not-found");
  });

  it("refuses malformed bodies and fields the contract doesn't allow", async () => {
    const { send, call } = api();
    expect((await send("{not json", { authorization: "Bearer user:alice" })).status).toBe(400);
    expect((await send("x".repeat(70_000), { authorization: "Bearer user:alice" })).status).toBe(400);
    const r = await call("alice", "createAccount", { kind: "bank", name: "City", currency: "BDT", ownerId: "bob" });
    expect(r).toEqual({ status: 400, body: { error: { code: "invalid-argument", message: "invalid request" } } });
  });

  it("outside local mode, any verified Google account gets in, and nothing else does (CR-009)", async () => {
    const env = { MONEYTRACE_AI: "deepseek", DEEPSEEK_API_KEY: "unused" };
    const { call } = api(env);
    expect((await call("alice", "bootstrapUser")).status).toBe(200);
    expect((await call("friend", "bootstrapUser")).status).toBe(200);
    const handle = createApiHandler({
      getDeps: () => composeDeps(store, env),
      verifyCaller: () => Promise.resolve({ uid: "x", email: "x@example.com", emailVerified: false, provider: "google" }),
      cronSecret: CRON,
      allowedOrigins: [],
      background: () => undefined,
      nowMs: () => Date.now(),
    });
    const res = await handle(new Request("https://x/api", { method: "POST", headers: { authorization: "Bearer t" }, body: JSON.stringify({ command: "bootstrapUser", data: {} }) }));
    expect(res.status).toBe(403);
  });

  it("answers CORS preflight only for the app's own origin", async () => {
    const { handle } = api();
    const pre = (origin: string) => handle(new Request("https://x/api", { method: "OPTIONS", headers: { origin } }));
    expect((await pre(ORIGIN)).headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect((await pre("https://evil.example")).headers.get("access-control-allow-origin")).toBeNull();
  });

  it("maps domain refusals to their wire codes, and one user can't touch another's data", async () => {
    const { ok, call } = api();
    await ok("alice", "bootstrapUser");
    await ok("bob", "bootstrapUser");
    const count = await ok("alice", "recordReconciliation", { idempotencyKey: "c1", countedMinor: 0, currency: "BDT" });
    expect((await call("bob", "recordAdjustment", { reconciliationId: count["reconciliationId"], cause: "mine now" })).body.error).toEqual({
      code: "not-found",
      message: "resourceNotFound",
    });
  });
});

describe("AI plans (CR-009)", () => {
  it("the OWNER_EMAIL account becomes the owner at first sign-in; everyone else is a member", async () => {
    const env = { ...OPEN_ENV, OWNER_EMAIL: " Mabrur@Example.com " };
    const a = api(env);
    await a.ok("mabrur", "bootstrapUser");
    await a.ok("friend", "bootstrapUser");
    const deps = composeDeps(store, env);
    expect(await deps.aiPlans.planOf(asOwnerId("mabrur"))).toBe("owner");
    expect(await deps.aiPlans.planOf(asOwnerId("friend"))).toBe("member");
  });

  it("without OWNER_EMAIL nobody is the owner", async () => {
    const a = api();
    await a.ok("mabrur", "bootstrapUser");
    expect(await composeDeps(store, OPEN_ENV).aiPlans.planOf(asOwnerId("mabrur"))).toBe("member");
  });
});

describe("delete my account (CR-009)", () => {
  const ownRows = async (uid: string) => (await store.client.query("select path, data from docs where owner_id = $1", [uid])).rows.map((r) => r.path);

  it("needs the typed confirmation", async () => {
    const a = api();
    await a.ok("alice", "bootstrapUser");
    expect((await a.call("alice", "requestAccountDeletion", { confirmation: "delete my account" })).status).toBe(400);
    expect((await ownRows("alice")).length).toBeGreaterThan(0);
  });

  it("erases every row of the user, verifies it, deletes the login and logs only a hash", async () => {
    deletedAuthUsers.length = 0;
    const a = api({ ...OPEN_ENV, OWNER_EMAIL: "alice@example.com" });
    await setUp(a, "alice");
    await a.ok("alice", "submitEvidence", { idempotencyKey: "k1", text: sms("EXAMPLE ATM DHAKA") });
    await a.settle();
    await setUp(a, "bob");
    const bobBefore = await ownRows("bob");
    expect((await ownRows("alice")).length).toBeGreaterThan(10);

    const r = await a.ok("alice", "requestAccountDeletion", { confirmation: "DELETE MY ACCOUNT" });
    expect(typeof r["requestId"]).toBe("string");
    expect(await ownRows("alice")).toEqual([]);
    expect((await store.doc("aiPlans/alice").get()).exists).toBe(false);
    expect(deletedAuthUsers).toEqual(["alice"]);
    const log = await store.collection("deletionLog").get();
    expect(log.docs.map((d) => d.data())).toEqual([{ ownerIdHash: expect.stringMatching(/^[0-9a-f]{64}$/) as string, deletedAtMs: expect.any(Number) as number }]);
    expect(JSON.stringify(log.docs.map((d) => d.data()))).not.toContain("alice");
    // Nobody else is touched.
    expect(await ownRows("bob")).toEqual(bobBefore);
  });

  it("is safe to run again", async () => {
    const a = api();
    await a.ok("alice", "bootstrapUser");
    await a.ok("alice", "requestAccountDeletion", { confirmation: "DELETE MY ACCOUNT" });
    expect((await a.call("alice", "requestAccountDeletion", { confirmation: "DELETE MY ACCOUNT" })).status).toBe(200);
    expect(await ownRows("alice")).toEqual([]);
  });

  it("refuses when the login can't be deleted, and says so", async () => {
    const deps = composeDeps(store, OPEN_ENV, { deleteAuthUser: () => Promise.reject(new Error("auth admin down")) });
    const handle = createApiHandler({
      getDeps: () => deps,
      verifyCaller: () => Promise.resolve(google("alice")),
      cronSecret: CRON,
      allowedOrigins: [],
      background: () => undefined,
      nowMs: () => Date.now(),
    });
    const send = (command: string, data: unknown) =>
      handle(new Request("https://x/api", { method: "POST", headers: { authorization: "Bearer t" }, body: JSON.stringify({ command, data }) }));
    await send("bootstrapUser", {});
    expect((await send("requestAccountDeletion", { confirmation: "DELETE MY ACCOUNT" })).status).toBe(500);
  });
});

describe("/api jobs", () => {
  it("need the cron secret", async () => {
    const { send } = api();
    expect((await send({ job: "recoverExpiredClaims" })).status).toBe(403);
    expect((await send({ job: "recoverExpiredClaims" }, { "x-cron-secret": "wrong-secret-123456" })).status).toBe(403);
    expect((await send({ job: "nope" }, { "x-cron-secret": CRON })).status).toBe(404);
    for (const job of ["recoverExpiredClaims", "dispatchFollowUps", "resumeQuotaBlockedEvents", "purgeProviderResults", "advancePending"]) {
      expect(await send({ job }, { "x-cron-secret": CRON })).toEqual({ status: 200, body: { result: { job } } });
    }
  });
});

const sms = (needle: string): string => {
  const e = corpus.find((c) => c.text.includes(needle));
  if (e === undefined) throw new Error(needle);
  return e.text;
};

async function setUp(a: ReturnType<typeof api>, uid: string) {
  await a.ok(uid, "bootstrapUser");
  const account = async (kind: string, name: string) => String((await a.ok(uid, "createAccount", { kind, name, currency: "BDT" }))["accountId"]);
  const bank = await account("bank", "BRAC");
  const wallet = await account("cash", "My wallet");
  await a.ok(uid, "createPaymentInstrument", { accountId: bank, provider: "brac", maskedIdentifier: "8888", type: "bankAccount" });
  await a.ok(uid, "recordOpeningBalance", { accountId: bank, amountMinor: 10_000_000, currency: "BDT", effectiveAtMs: Date.parse("2026-01-01T00:00:00Z") });
  return { bank, wallet };
}

const balance = async (uid: string, accountId: string) => {
  const s = await store.doc(`users/${uid}/balances/${accountId}`).get();
  return s.exists ? (s.get("debitMinusCreditMinor") as number) : 0;
};

describe("/api runs the SMS pipeline without a trigger", () => {
  it("gate 25: a withdrawal SMS posts right after submit, and its question resolves", async () => {
    const a = api();
    const { bank, wallet } = await setUp(a, "alice");
    const { sourceEventId } = await a.ok("alice", "submitEvidence", { idempotencyKey: "k1", text: sms("EXAMPLE ATM DHAKA") });
    await a.settle();
    expect((await store.doc(`users/alice/sourceEvents/${String(sourceEventId)}`).get()).get("status")).toBe("posted");
    expect(await balance("alice", bank)).toBe(10_000_000 - 400_000);
    expect(await balance("alice", "cash-unassigned")).toBe(400_000);
    const open = await store.collection("users/alice/followUps").where("state", "==", "open").get();
    expect(open.docs.map((d) => d.get("question"))).toEqual(["You withdrew ৳4,000 from an ATM. Where did the cash go?"]);
    await a.ok("alice", "resolveFollowUp", { followUpId: open.docs[0]?.id, resolution: { kind: "destination", accountId: wallet } });
    expect(await balance("alice", wallet)).toBe(400_000);
    expect(await balance("alice", "cash-unassigned")).toBe(0);
  });

  it("an event whose drive was lost is finished by the advancePending sweep", async () => {
    const a = api();
    await setUp(a, "alice");
    const { sourceEventId } = await a.ok("alice", "submitEvidence", { idempotencyKey: "k1", text: sms("EXAMPLE ATM DHAKA") });
    await a.settle();
    // Simulate a crash before the drive: a second SMS through a handler whose background work is dropped.
    const lost = createApiHandler({
      getDeps: () => composeDeps(store, OPEN_ENV),
      verifyCaller: () => Promise.resolve(google("alice")),
      cronSecret: CRON,
      allowedOrigins: [],
      background: () => undefined,
      nowMs: () => Date.now(),
    });
    const res = await lost(new Request("https://x/api", { method: "POST", headers: { authorization: "Bearer t" }, body: JSON.stringify({ command: "submitEvidence", data: { idempotencyKey: "k2", text: sms("EXAMPLE PHARMA") } }) }));
    const second = ((await res.json()) as { result: { sourceEventId: string } }).result.sourceEventId;
    expect(second).not.toBe(sourceEventId);
    expect((await store.doc(`users/alice/sourceEvents/${second}`).get()).get("status")).toBe("received");
    expect((await a.send({ job: "advancePending" }, { "x-cron-secret": CRON })).status).toBe(200);
    expect((await store.doc(`users/alice/sourceEvents/${second}`).get()).get("status")).not.toBe("received");
  });
});

describe("supabaseCallerVerifier", () => {
  const user = (over: Record<string, unknown>) => ({ id: "u1", email: "a@example.com", email_confirmed_at: "2026-11-13T00:00:00Z", app_metadata: { provider: "google" }, ...over });
  const verifier = (status: number, body: unknown) => {
    const seen: Request[] = [];
    const v = supabaseCallerVerifier("https://p.supabase.co", "anon", (input, init) => {
      seen.push(new Request(input, init));
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    });
    return { v, seen };
  };

  it("asks Supabase Auth and maps a Google user", async () => {
    const { v, seen } = verifier(200, user({}));
    expect(await v("jwt")).toEqual({ uid: "u1", email: "a@example.com", emailVerified: true, provider: "google" });
    expect(seen[0]?.url).toBe("https://p.supabase.co/auth/v1/user");
    expect(seen[0]?.headers.get("authorization")).toBe("Bearer jwt");
  });

  it("an unconfirmed email or another provider is not a verified Google caller", async () => {
    expect(await verifier(200, user({ email_confirmed_at: null })).v("jwt")).toMatchObject({ emailVerified: false });
    expect(await verifier(200, user({ app_metadata: { provider: "email" } })).v("jwt")).toMatchObject({ provider: "other" });
  });

  it("a rejected or malformed token proves nobody", async () => {
    expect(await verifier(401, { msg: "bad jwt" }).v("jwt")).toBeUndefined();
    expect(await verifier(200, { id: "" }).v("jwt")).toBeUndefined();
  });
});
