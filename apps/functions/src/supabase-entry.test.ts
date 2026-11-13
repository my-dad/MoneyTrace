import { describe, expect, it } from "vitest";
import { supabaseAuthUserDeleter } from "./supabase-entry";

describe("supabaseAuthUserDeleter", () => {
  const deleter = (status: number) => {
    const seen: Request[] = [];
    const del = supabaseAuthUserDeleter("https://p.supabase.co", "service-key", (input, init) => {
      seen.push(new Request(input, init));
      return Promise.resolve(new Response("{}", { status }));
    });
    return { del, seen };
  };

  it("deletes the login with the service key", async () => {
    const { del, seen } = deleter(200);
    await del("8b0c-uid");
    expect(seen[0]?.method).toBe("DELETE");
    expect(seen[0]?.url).toBe("https://p.supabase.co/auth/v1/admin/users/8b0c-uid");
    expect(seen[0]?.headers.get("authorization")).toBe("Bearer service-key");
  });

  it("a login already gone is done; any other failure is reported", async () => {
    await expect(deleter(404).del("u")).resolves.toBeUndefined();
    await expect(deleter(500).del("u")).rejects.toThrow("auth user deletion failed: 500");
  });
});
