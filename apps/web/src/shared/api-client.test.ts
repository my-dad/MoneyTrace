import { describe, expect, it } from "vitest";
import { createApiCall } from "./api-client";

const reply = (status: number, body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body), { status }));

function call(fetchImpl: typeof fetch, token: string | null = "jwt") {
  return createApiCall({ url: "https://p.supabase.co/functions/v1/api", anonKey: "anon", accessToken: () => Promise.resolve(token), fetchImpl });
}

describe("createApiCall", () => {
  it("posts the command with the user's token and returns the result", async () => {
    const seen: Request[] = [];
    const api = call((input, init) => {
      seen.push(new Request(input, init));
      return Promise.resolve(new Response(JSON.stringify({ result: { accountId: "a1" } }), { status: 200 }));
    });
    expect(await api("createAccount", { name: "City" })).toEqual({ accountId: "a1" });
    expect(seen[0]?.headers.get("authorization")).toBe("Bearer jwt");
    expect(seen[0]?.headers.get("apikey")).toBe("anon");
    expect(await seen[0]?.json()).toEqual({ command: "createAccount", data: { name: "City" } });
  });

  it("a refusal keeps the functions/<code> shape the screens read", async () => {
    await expect(call(reply(400, { error: { code: "failed-precondition", message: "invalidTransition" } }))("x", {})).rejects.toMatchObject({
      code: "functions/failed-precondition",
      message: "invalidTransition",
    });
    await expect(call(reply(409, { error: { code: "already-exists", message: "idempotencyConflict" } }))("x", {})).rejects.toMatchObject({
      code: "functions/already-exists",
    });
  });

  it("no session, no network, or a non-JSON gateway error are failures too", async () => {
    await expect(call(reply(200, { result: 1 }), null)("x", {})).rejects.toMatchObject({ code: "functions/unauthenticated" });
    await expect(call(() => Promise.reject(new TypeError("offline")))("x", {})).rejects.toMatchObject({ code: "functions/unavailable" });
    await expect(call(() => Promise.resolve(new Response("<html>bad gateway</html>", { status: 502 })))("x", {})).rejects.toMatchObject({
      code: "functions/internal",
    });
  });
});
