export type SupabaseEnv = {
  url?: string | undefined;
  anonKey?: string | undefined;
  dataSource?: string | undefined;
  useEmulators?: string | undefined;
};

/** Literal `process.env.NEXT_PUBLIC_*` reads: Next.js inlines only those into the browser bundle. */
export function readSupabaseEnv(): SupabaseEnv {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    dataSource: process.env.NEXT_PUBLIC_DATA_SOURCE,
    useEmulators: process.env.NEXT_PUBLIC_USE_EMULATORS,
  };
}

/**
 * The project URL and its public (anon) key (CR-010). The anon key is public by design: row-level
 * security decides what it can read, and it can write nothing. A real build must have both.
 */
export function resolveSupabaseConfig(env: SupabaseEnv): { url: string; anonKey: string } {
  const url = env.url ?? "";
  const anonKey = env.anonKey ?? "";
  const missing = [url === "" ? "NEXT_PUBLIC_SUPABASE_URL" : null, anonKey === "" ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null].filter(
    (m): m is string => m !== null,
  );
  if (missing.length > 0) throw new Error(`Missing Supabase config: ${missing.join(", ")}`);
  if (!/^https:\/\/[^/]+$/.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be the project's https origin");
  }
  return { url, anonKey };
}

/** Firebase stays only for the emulator end-to-end suite until it is removed (CR-010, Phase 8). */
export function usesSupabase(env: SupabaseEnv): boolean {
  return env.dataSource !== "fixture" && env.useEmulators !== "1";
}
