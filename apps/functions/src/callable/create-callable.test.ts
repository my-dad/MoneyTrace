import { COMMANDS } from "@moneytrace/contracts";
import { DomainError } from "@moneytrace/domain";
import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { runCallable, type CallableDeps } from "./create-callable";

type Logged = { level: string; event: string; fields: Record<string, unknown> };

function harness() {
  const logs: Logged[] = [];
  const log = (level: string) => (event: string, fields: Record<string, unknown>) => {
    logs.push({ level, event, fields });
  };
  const deps = {
    logger: { info: log("info"), warn: log("warn"), error: log("error") },
    ids: { newId: () => "corr-1" },
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

  it("passes an already-exists HttpsError from a handler through", async () => {
    const { deps } = harness();
    const r = await codeOf(
      runCallable(
        contract,
        () => Promise.reject(new HttpsError("already-exists", "idempotencyConflict")),
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
