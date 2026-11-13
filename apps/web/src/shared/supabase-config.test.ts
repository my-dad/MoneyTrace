import { describe, expect, it } from "vitest";
import { resolveSupabaseConfig, usesSupabase } from "./supabase-config";

describe("Supabase config", () => {
  it("needs the project URL and anon key", () => {
    expect(() => resolveSupabaseConfig({})).toThrow("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(resolveSupabaseConfig({ url: "https://abc.supabase.co", anonKey: "k" })).toEqual({ url: "https://abc.supabase.co", anonKey: "k" });
  });

  it("refuses a URL that isn't a bare https origin", () => {
    expect(() => resolveSupabaseConfig({ url: "http://abc.supabase.co", anonKey: "k" })).toThrow();
    expect(() => resolveSupabaseConfig({ url: "https://abc.supabase.co/", anonKey: "k" })).toThrow();
    expect(resolveSupabaseConfig({ url: "http://127.0.0.1:54321", anonKey: "k" }).url).toBe("http://127.0.0.1:54321");
  });

  it("is the backend everywhere but demo and emulator builds", () => {
    expect(usesSupabase({})).toBe(true);
    expect(usesSupabase({ dataSource: "fixture" })).toBe(false);
    expect(usesSupabase({ useEmulators: "1" })).toBe(false);
  });
});
