// Supabase Edge Function `/api` (CR-010). Built by `pnpm build:supabase`; see apps/functions/src/api.ts.
import postgres from "npm:postgres@3.4.9";
import { startApi } from "./bundle.mjs";

declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void };

const sql = postgres(Deno.env.get("SUPABASE_DB_URL") ?? "", { prepare: false, max: 3, idle_timeout: 20 });
const handle = startApi({
  sql,
  env: Deno.env.toObject(),
  waitUntil: (work) => EdgeRuntime.waitUntil(work),
});

Deno.serve(handle);
