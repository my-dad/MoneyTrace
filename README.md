# MoneyTrace

MoneyTrace is a mobile-first, evidence-driven personal finance tracker for
Bangladesh. It keeps an append-only, balanced ledger while treating bank SMS,
receipts, uploads, and chat as evidence that must be validated before posting.

## Status

The Phase 1 SMS vertical slice, the dashboard with its chat, and open sign-up for
friends and family (CR-009) are built. The backend runs on Supabase and the web app
on Cloudflare Pages, both on free plans with no billing account (PRD CR-010).
Going live follows [`docs/release/supabase-runbook.md`](docs/release/supabase-runbook.md).

See [`AGENT.md`](AGENT.md) for the engineering rules and
[`MoneyTrace_PRD_v1.0.md`](MoneyTrace_PRD_v1.0.md) for the product.

## Local setup

Requirements: Node 22 and pnpm 12.18.0 through Corepack. Docker only for
`pnpm test:e2e` (it starts a local Supabase).

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm --filter web build
pnpm test:e2e:fixture
pnpm test:e2e
```

Useful commands:

- `pnpm verify` — lint, typecheck, dependency boundaries, and unit tests. The
  adapter, `/api` and row-level-security suites run on an in-process Postgres
  (PGlite); set `MONEYTRACE_TEST_PG_URL` to run the adapter suites on a real one.
- `pnpm test:e2e:fixture` — the demo build (`NEXT_PUBLIC_DATA_SOURCE=fixture`) in
  a phone-sized browser; no backend.
- `pnpm test:e2e` — local Supabase (our migrations, `/api` with a fake AI), the web
  app built against it with local sign-in, then the browser suite.
- `pnpm smoke:supabase` — bundles `/api` and loads it under Deno.
- `pnpm deploy:supabase` — Mabrur only, per the runbook: checks the secrets, applies
  the migrations and deploys `/api`. The web app deploys itself when `master` changes.

The web app reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(see `apps/web/.env.example`); the anon key is public by design.

## Repository map

- `apps/functions` — the call gate, command handlers, jobs and the `/api` handler.
- `apps/web` — Next.js static web app (PWA) and Supabase sign-in.
- `packages/domain` — pure accounting and lifecycle rules.
- `packages/application` — use cases and ports.
- `packages/contracts` — validated document and command contracts.
- `packages/infrastructure` — the Postgres document store and the adapters on it.
- `supabase` — migrations (table, read policy, scheduled jobs, live updates) and the
  `/api` Edge Function entry.
- `tools` — backups and the restore drill, deploy checks, the local static server.
- `docs` — architecture, ADRs, glossary, runbooks, and plans.
