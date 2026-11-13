# Supabase migration (CR-010) — progress

Plan: docs/superpowers/plans/2026-11-13-supabase-migration.md. Branch: supabase-migration.
One line per subtask. The last line is always `next:`, `blocked on Mabrur:` or `done`.

- T0.3 branch created; plan and this file committed
- T0.1 CR-010 written in the PRD (status Proposed)
- T1.1 core code bundled with esbuild (platform neutral) runs identically on Node 22 and Deno 2.5.6: withdrawal posts, balances, sha256 (node:crypto), zod. Finding: `@moneytrace/infrastructure`'s index pulls firebase-admin (Node-only) — removed by the DocStore work in Phase 2. Throwaway spike deleted.
- T1.1 deploy a test Edge Function: waits for Mabrur's Supabase project (T0.2)
- T1.2 needs a real Postgres (no Docker/psql here) — waits for T0.2; Phase 2 starts meanwhile on PGlite
next: T2.1 schema + T2.2 DocStore (blocked on Mabrur for: T0.2 accounts, CR-010 acceptance — work continues around them)
