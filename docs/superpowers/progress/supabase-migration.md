# Supabase migration (CR-010) — progress

Plan: docs/superpowers/plans/2026-11-13-supabase-migration.md. Branch: supabase-migration.
One line per subtask. The last line is always `next:`, `blocked on Mabrur:` or `done`.

- T0.3 branch created; plan and this file committed
- T0.1 CR-010 written in the PRD (status Proposed)
- T1.1 core code bundled with esbuild (platform neutral) runs identically on Node 22 and Deno 2.5.6: withdrawal posts, balances, sha256 (node:crypto), zod. Finding: `@moneytrace/infrastructure`'s index pulls firebase-admin (Node-only) — removed by the DocStore work in Phase 2. Throwaway spike deleted.
- T1.1 deploy a test Edge Function: waits for Mabrur's Supabase project (T0.2)
- T1.2 needs a real Postgres (no Docker/psql here) — waits for T0.2; Phase 2 starts meanwhile on PGlite
- T2.1 `supabase/migrations/20261113000000_docs.sql`: docs(path pk "C", parent, collection_id, owner_id, data jsonb), RLS enabled (policies come with T3.6)
- T2.2 DocStore interface + PgDocStore (serializable tx, retry 40001/40P01, ABORTED=10 after last attempt, create→ALREADY_EXISTS=6, same-JSON-type filters, orderBy skips missing fields). Ruling: store code was written before its tests (17 semantics tests added right after, all green) — cost if wrong: a semantic gap the adapter contract tests (T2.4) will expose.
- T2.3 PGlite harness (test/support/pglite.ts) applies the real migration
- T2.4 12 adapters take `DocStore` (not firebase-admin types); Firebase app wraps Firestore with `fromFirestore`. 7 adapter suites renamed `*.store.test.ts` and run on BOTH backends: Postgres (PGlite) in `pnpm test`, Firestore emulator in `test:emulator:core`. Rate limiter stores `expiresAtMs` (number) instead of a Firestore Timestamp. `pnpm verify` → 98 files, 1729 tests pass (was 1510; +276 adapter tests on Postgres, +17 store tests)
- T2.4 Firestore emulator suite unchanged: 11 files, 463/463 pass with the adapters on DocStore
- T3.1–T3.3 commands and call gate made transport-free (`callable/command.ts`: runCommand + CallError; `callable/registry.ts`: 17 client commands; access via neutral `Caller`). Firebase `onCall` wraps the same code. `api.ts`: one web-standard handler — {command,data}+bearer, {job}+x-cron-secret, CORS allowlist, 64 KB body cap, same wire codes (HTTP 400/401/403/404/409/429/500). `supabaseCallerVerifier` asks Supabase Auth `/auth/v1/user`.
- T3.4 `jobs.ts`: `drivePipeline` runs stages after submit/retry/confirm/answer (background); new `advancePending` sweep job + `listRunnable` (test-first) replace the Firestore trigger. 4 jobs moved to `JOBS`.
- api.test.ts (11, in-process on PGlite): gate refusals, cross-user not-found, CORS, cron secret, gate-25 SMS → posted → question resolved, lost drive finished by sweep. `pnpm verify` → 99 files, 1741 tests pass.
- Regression caught by the Firebase emulator suite and fixed test-first: a sign-in with no user id (emulator accepts junk tokens) must be unauthenticated — `runCommand` now refuses a missing/empty uid (2 new unit tests RED→GREEN). Cross-user "covers every callable" now reads the command registry. Firebase functions emulator 28/28; `pnpm verify` 99 files, 1743 tests.
- T3.6 RLS: `20261113000100_docs_read_policy.sql` — authenticated users select only their profile + clientRead collections; no client writes; anon nothing. 7 tests on PGlite with Supabase role/auth.uid() stub, incl. registry ↔ policy list.
- T3.5 jobs: `20261113000200_jobs.sql` — pg_cron + pg_net call /api via Vault secrets (api_url, cron_secret); 4 contract jobs at contract cadence + advancePending every minute + rate-limit expiry (was Firestore TTL). 3 tests.
- Driver: `postgresJsClient` (postgres.js 3.4.9, prepare:false) tested through PGlite socket server. Bug found and fixed: postgres.js re-encodes jsonb params → documents stored as JSON strings; now sent as `::text::jsonb`, and reading a non-object fails loudly. `pnpm verify` 102 files, 1758 tests.
- Edge Function: `supabase-entry.ts` (startApi: refuses to start without SUPABASE_URL, SUPABASE_ANON_KEY, CRON_SECRET, ALLOWED_ORIGINS, DEEPSEEK_API_KEY), `build-supabase.mjs` → `supabase/functions/api/bundle.mjs` (gitignored, 1 MB, no Firebase, imports only node:crypto), `supabase/functions/api/index.ts` (npm:postgres, EdgeRuntime.waitUntil), `supabase/config.toml` (verify_jwt=false: /api checks callers itself). `pnpm smoke:supabase`: bundle under Deno 2.5.6 + npm:postgres against Postgres → PASS (401 no token, 403 bad cron secret, 5 jobs 200, CORS 204). `pnpm verify` 102 files, 1758 tests.
next: Phase 4 web (T4.1 supabase-js client, T4.2 sign-in, T4.3 reads, T4.4 commands, T4.5 hosting) — Phase 3 remaining: T3.6 per-command emulator tests are covered by api.test.ts + Firebase suite; live checks wait for Mabrur's project (T0.2)
