import { describe, expect, it } from "vitest";
import { assertFixtureModeAllowed } from "./fixture-guard";

const REAL = "https://abcd.supabase.co";
const LOCAL = "http://127.0.0.1:54321";
const check = (env: Record<string, string | undefined>) => () => {
  assertFixtureModeAllowed(env);
};

describe("assertFixtureModeAllowed (CR-010: the demo and local sign-in never reach a real project)", () => {
  it("allows fixture mode with no Supabase project", () => {
    expect(check({ NEXT_PUBLIC_DATA_SOURCE: "fixture" })).not.toThrow();
  });

  it("allows fixture mode and local sign-in against a local Supabase", () => {
    expect(check({ NEXT_PUBLIC_DATA_SOURCE: "fixture", NEXT_PUBLIC_SUPABASE_URL: LOCAL })).not.toThrow();
    expect(check({ NEXT_PUBLIC_LOCAL_SIGN_IN: "1", NEXT_PUBLIC_SUPABASE_URL: LOCAL })).not.toThrow();
    expect(check({ NEXT_PUBLIC_LOCAL_SIGN_IN: "1", NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" })).not.toThrow();
  });

  it("rejects fixture mode on a real project", () => {
    expect(check({ NEXT_PUBLIC_DATA_SOURCE: "fixture", NEXT_PUBLIC_SUPABASE_URL: REAL })).toThrow(
      "Fixture mode needs a local Supabase (or none)",
    );
  });

  it("rejects local sign-in on a real project or with no project", () => {
    expect(check({ NEXT_PUBLIC_LOCAL_SIGN_IN: "1", NEXT_PUBLIC_SUPABASE_URL: REAL })).toThrow(
      "Local sign-in needs a local Supabase",
    );
    expect(check({ NEXT_PUBLIC_LOCAL_SIGN_IN: "1" })).toThrow("Local sign-in needs a local Supabase");
  });

  it("allows a real build on a real project", () => {
    expect(check({ NEXT_PUBLIC_SUPABASE_URL: REAL })).not.toThrow();
  });
});
