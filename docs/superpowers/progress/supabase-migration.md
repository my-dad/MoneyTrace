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
next: confirm Firebase functions emulator suite still green, then T3.5 pg_cron migration + T3.6 RLS + Edge Function entry
