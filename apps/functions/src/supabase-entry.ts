import { PgDocStore, postgresJsClient } from "@moneytrace/infrastructure";
import type { Sql } from "postgres";
import { createApiHandler, supabaseCallerVerifier } from "./api";
import { composeDeps, type Deps } from "./composition";

export type SupabaseEnv = Readonly<Record<string, string | undefined>>;

/** The variables the deployed function refuses to start without (secrets are set by Mabrur). */
export const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "CRON_SECRET", "ALLOWED_ORIGINS", "DEEPSEEK_API_KEY"] as const;

/**
 * Builds the `/api` handler for the Supabase Edge Function (CR-010). The function file passes in
 * postgres.js (imported as `npm:postgres`), its environment and `EdgeRuntime.waitUntil`.
 */
export function startApi(opts: {
  sql: Sql;
  env: SupabaseEnv;
  waitUntil: (work: Promise<unknown>) => void;
}): (req: Request) => Promise<Response> {
  const { env } = opts;
  const missing = REQUIRED_ENV.filter((k) => (env[k] ?? "") === "");
  if (missing.length > 0) throw new Error(`missing configuration: ${missing.join(", ")}`);
  const store = new PgDocStore(postgresJsClient(opts.sql));
  let deps: Deps | undefined;
  return createApiHandler({
    getDeps: () => (deps ??= composeDeps(store, env)),
    verifyCaller: supabaseCallerVerifier(env["SUPABASE_URL"] as string, env["SUPABASE_ANON_KEY"] as string, fetch),
    cronSecret: env["CRON_SECRET"],
    allowedOrigins: (env["ALLOWED_ORIGINS"] as string).split(",").map((o) => o.trim()).filter((o) => o !== ""),
    background: opts.waitUntil,
    nowMs: () => Date.now(),
  });
}
