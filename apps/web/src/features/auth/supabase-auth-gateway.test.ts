import { describe, expect, it } from "vitest";
import { createSupabaseAuthGateway } from "./supabase-auth-gateway";

function fakeAuth() {
  let listener: ((event: string, session: unknown) => void) | undefined;
  const calls: unknown[] = [];
  let unsubscribed = false;
  const auth = {
    onAuthStateChange(cb: (event: string, session: unknown) => void) {
      listener = cb;
      return { data: { subscription: { unsubscribe: () => (unsubscribed = true) } } };
    },
    signInWithOAuth(args: unknown) {
      calls.push(args);
      return Promise.resolve({ data: {}, error: null });
    },
    signOut() {
      calls.push("signOut");
      return Promise.resolve({ error: null });
    },
  };
  return { auth, calls, emit: (session: unknown) => listener?.("SIGNED_IN", session), unsubscribed: () => unsubscribed };
}

describe("Supabase auth gateway", () => {
  it("reports the signed-in user with their Google name, then nobody", () => {
    const f = fakeAuth();
    const seen: unknown[] = [];
    const gw = createSupabaseAuthGateway(f.auth as never, () => Promise.resolve({}), () => "https://app.example");
    const stop = gw.onChange((u) => seen.push(u));
    f.emit({ user: { id: "u1", user_metadata: { full_name: "Mabrur" } } });
    f.emit({ user: { id: "u2", user_metadata: {} } });
    f.emit(null);
    expect(seen).toEqual([{ uid: "u1", displayName: "Mabrur" }, { uid: "u2" }, null]);
    stop();
    expect(f.unsubscribed()).toBe(true);
  });

  it("signs in with Google by redirect back to the app", async () => {
    const f = fakeAuth();
    await createSupabaseAuthGateway(f.auth as never, () => Promise.resolve({}), () => "https://app.example").signIn();
    expect(f.calls).toEqual([{ provider: "google", options: { redirectTo: "https://app.example/" } }]);
  });

  it("bootstrap calls /api and checks the reply", async () => {
    const f = fakeAuth();
    const sent: unknown[] = [];
    const ok = createSupabaseAuthGateway(f.auth as never, (c, d) => (sent.push([c, d]), Promise.resolve({ created: true })), () => "");
    await ok.bootstrap();
    expect(sent).toEqual([["bootstrapUser", {}]]);
    const bad = createSupabaseAuthGateway(f.auth as never, () => Promise.resolve({ nope: 1 }), () => "");
    await expect(bad.bootstrap()).rejects.toThrow();
  });

  it("a sign-in error is reported, not swallowed", async () => {
    const f = fakeAuth();
    f.auth.signInWithOAuth = () => Promise.resolve({ data: {}, error: new Error("provider disabled") as never });
    await expect(createSupabaseAuthGateway(f.auth as never, () => Promise.resolve({}), () => "").signIn()).rejects.toThrow("provider disabled");
  });
});
