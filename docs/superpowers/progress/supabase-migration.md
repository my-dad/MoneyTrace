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
next: T2.4 move the 12 Firestore adapters to DocStore and run their contract tests on PGlite
