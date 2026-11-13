import { COMMANDS } from "@moneytrace/contracts";
import { DomainError } from "@moneytrace/domain";
import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { InMemoryRateLimiter } from "@moneytrace/application/testing";
import { CALLABLE_OPTIONS, CALLABLE_RATE_LIMITS, runCallable, type CallableDeps } from "./create-callable";
import { accessPolicyFromEnv } from "./access";
import { CallError } from "./command";

type Logged = { level: string; event: string; fields: Record<string, unknown> };

function harness() {
  const logs: Logged[] = [];
  const log = (level: string) => (event: string, fields: Record<string, unknown>) => {
    logs.push({ level, event, fields });
  };
  const deps = {
    logger: { info: log("info"), warn: log("warn"), error: log("error") },
    ids: { newId: () => "corr-1" },
    callGate: { access: accessPolicyFromEnv({ FUNCTIONS_EMULATOR: "true" }), limiter: new InMemoryRateLimiter(), limits: CALLABLE_RATE_LIMITS, nowMs: () => 1_700_000_040_000 },
  } as unknown as CallableDeps;
  return { logs, deps };
}

const contract = COMMANDS.createAccount;
const goodData = { kind: "bank", name: "City", currency: "BDT" };
const authed = { auth: { uid: "alice" }, data: goodData };

async function codeOf(p: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(HttpsError);
    const err = e as HttpsError;
    return { code: err.code, message: err.message };
  }
  throw new Error("expected a rejection");
}

describe("runCallable error mapping", () => {
  it("rejects a request without a verified token as unauthenticated and never runs the handler", async () => {
    const { deps } = harness();
    let ran = false;
    const r = await codeOf(
      runCallable(contract, () => ((ran = true), Promise.resolve({ accountId: "a" })), deps, {
        data: goodData,
      }),
    );
    expect(r.code).toBe("unauthenticated");
    expect(ran).toBe(false);
  });

  it.each([
    ["an unknown field such as ownerId", { ...goodData, ownerId: "bob" }],
    ["a missing field", { kind: "bank", currency: "BDT" }],
    ["a non-object body", null],
  ])("maps %s to invalid-argument without running the handler", async (_n, data) => {
    const { deps } = harness();
    let ran = false;
    const r = await codeOf(
      runCallable(contract, () => ((ran = true), Promise.resolve({ accountId: "a" })), deps, {
        auth: { uid: "alice" },
        data,
      }),
    );
    expect(r.code).toBe("invalid-argument");
    expect(ran).toBe(false);
  });

  it("maps DomainError accountInvalid to not-found with the code only", async () => {
    const { deps } = harness();
    const r = await codeOf(
      runCallable(
        contract,
        () => Promise.reject(new DomainError("accountInvalid", "secret detail")),
        deps,
        authed,
      ),
    );
    expect(r).toEqual({ code: "not-found", message: "accountInvalid" });
  });

  it.each(["beforeCutover", "cutoverHasActivity", "invalidMoney"] as const)(
    "maps DomainError %s to failed-precondition with the code only",
    async (code) => {
      const { deps } = harness();
      const r = await codeOf(
        runCallable(
          contract,
          () => Promise.reject(new DomainError(code, "secret detail")),
          deps,
          authed,
        ),
      );
      expect(r).toEqual({ code: "failed-precondition", message: code });
    },
  );

  it("passes an already-exists refusal from a handler through as HttpsError", async () => {
    const { deps } = harness();
    const r = await codeOf(
      runCallable(
        contract,
        () => Promise.reject(new CallError("already-exists", "idempotencyConflict")),
        deps,
        authed,
      ),
    );
    expect(r).toEqual({ code: "already-exists", message: "idempotencyConflict" });
  });

  it("maps anything else to internal without the thrown message, and logs a correlation id", async () => {
    const { deps, logs } = harness();
    const r = await codeOf(
      runCallable(
        contract,
        () => Promise.reject(new TypeError("account number 0123456789")),
        deps,
        authed,
      ),
    );
    expect(r.code).toBe("internal");
    expect(r.message).not.toContain("0123456789");
    const logged = JSON.stringify(logs);
    expect(logged).not.toContain("0123456789");
    const err = logs.find((l) => l.level === "error");
    expect(err?.fields["correlationId"]).toBe("corr-1");
    expect(err?.fields["errorName"]).toBe("TypeError");
  });

  it("maps a response that fails its contract to internal", async () => {
    const { deps } = harness();
    const r = await codeOf(
      runCallable(
        contract,
        () => Promise.resolve({ accountId: "a", extra: 1 } as never),
        deps,
        authed,
      ),
    );
    expect(r.code).toBe("internal");
  });

  it("passes the verified uid as ownerId and returns the parsed response", async () => {
    const { deps } = harness();
    let seen: unknown;
    const out = await runCallable(
      contract,
      (ctx, data) => {
        seen = { owner: ctx.ownerId, corr: ctx.correlationId, data };
        return Promise.resolve({ accountId: "acc-1" });
      },
      deps,
      authed,
    );
    expect(out).toEqual({ accountId: "acc-1" });
    expect(seen).toEqual({ owner: "alice", corr: "corr-1", data: goodData });
  });

  it("never logs the account name", async () => {
    const { deps, logs } = harness();
    await codeOf(
      runCallable(
        contract,
        () => Promise.reject(new DomainError("invalidIntent", "name Zed's Savings")),
        deps,
        { auth: { uid: "alice" }, data: { ...goodData, name: "Zed's Savings" } },
      ),
    );
    expect(JSON.stringify(logs)).not.toContain("Zed");
  });
});

describe("runCallable gate (release blockers A1, A2, A4)", () => {
  const deployedDeps = (limiter = new InMemoryRateLimiter()) => {
    const { deps, logs } = harness();
    const gated = { ...deps, callGate: { access: accessPolicyFromEnv({ ALLOWED_EMAILS: "owner@example.com" }), limiter, limits: CALLABLE_RATE_LIMITS, nowMs: () => 1_700_000_040_000 } } as unknown as CallableDeps;
    return { deps: gated, logs };
  };
  const as = (email: string, provider = "google.com", ip = "203.0.113.7") => ({
    auth: { uid: "owner", token: { email, email_verified: true, firebase: { sign_in_provider: provider } } },
    rawRequest: { ip },
    data: goodData,
  });
  const ok = () => Promise.resolve({ accountId: "a" });

  it("refuses an account not on the allowlist as permission-denied, without running the handler", async () => {
    const { deps } = deployedDeps();
    let ran = false;
    const r = await codeOf(runCallable(contract, () => ((ran = true), ok()), deps, as("stranger@example.com")));
    expect(r).toEqual({ code: "permission-denied", message: "permission-denied" });
    expect(ran).toBe(false);
  });

  it("refuses anonymous sign-in when deployed", async () => {
    const { deps } = deployedDeps();
    expect((await codeOf(runCallable(contract, ok, deps, as("owner@example.com", "anonymous")))).code).toBe("permission-denied");
  });

  it("lets the owner through", async () => {
    const { deps } = deployedDeps();
    expect(await runCallable(contract, ok, deps, as("owner@example.com"))).toEqual({ accountId: "a" });
  });

  it("after the per-user limit, calls are resource-exhausted until the next minute", async () => {
    const { deps, logs } = deployedDeps();
    for (let i = 0; i < CALLABLE_RATE_LIMITS.userPerMinute; i += 1) await runCallable(contract, ok, deps, as("owner@example.com"));
    const r = await codeOf(runCallable(contract, ok, deps, as("owner@example.com")));
    expect(r).toEqual({ code: "resource-exhausted", message: "rateLimited" });
    expect(logs.some((l) => l.event === "callable.rejected" && l.fields["errorCode"] === "rateLimited")).toBe(true);
  });

  it("keys the per-IP limit on a hash, never the raw address", async () => {
    const seen: string[] = [];
    const limiter = { take: (buckets: readonly { key: string }[]) => (seen.push(...buckets.map((b) => b.key)), Promise.resolve("allowed" as const)) };
    const { deps } = deployedDeps(limiter as unknown as InMemoryRateLimiter);
    await runCallable(contract, ok, deps, as("owner@example.com"));
    expect(seen.some((k) => k.startsWith("ip-"))).toBe(true);
    expect(seen.join(" ")).not.toContain("203.0.113.7");
  });
});

describe("callable options (release blockers A3, A5)", () => {
  it("enforces App Check outside the emulator and keeps instances small", () => {
    expect(CALLABLE_OPTIONS).toMatchObject({ enforceAppCheck: true, maxInstances: 3, concurrency: 1, memory: "256MiB", timeoutSeconds: 120 });
    expect(CALLABLE_OPTIONS.secrets).toContain("ALLOWED_EMAILS");
  });
});

