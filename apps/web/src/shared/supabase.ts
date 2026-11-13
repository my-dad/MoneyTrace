import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseEnv, resolveSupabaseConfig } from "./supabase-config";

let client: SupabaseClient | undefined;

/** Created on first use, so fixture and emulator builds never need Supabase settings. */
export function supabase(): SupabaseClient {
  client ??= (() => {
    const { url, anonKey } = resolveSupabaseConfig(readSupabaseEnv());
    return createClient(url, anonKey, { auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true } });
  })();
  return client;
}

export function apiUrl(): string {
  return `${resolveSupabaseConfig(readSupabaseEnv()).url}/functions/v1/api`;
}
