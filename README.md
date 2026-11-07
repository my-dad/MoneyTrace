# MoneyTrace

MoneyTrace is a mobile-first, evidence-driven personal finance tracker for
Bangladesh. It keeps an append-only, balanced ledger while treating bank SMS,
receipts, uploads, and chat as evidence that must be validated before posting.

## Status

The Phase 1 SMS vertical slice is locally implemented and verified. GitHub
Actions, production deployment, backups, and restore drills remain deferred
until the Phase 0B security and billing gates are approved.

See [`AGENT.md`](AGENT.md) for the engineering rules and
[`docs/superpowers/plans/2026-11-06-phase-0-foundations.md`](docs/superpowers/plans/2026-11-06-phase-0-foundations.md)
for the implementation plan.

## Local setup

Requirements: Node 22, pnpm 12.18.0 through Corepack, and JDK 21 or newer for
the Firebase emulator tooling.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm --filter web build
pnpm test:emulator
pnpm test:e2e
```

The emulator suite uses the non-production Firebase project ID
`demo-moneytrace` and local ports configured in [`firebase.json`](firebase.json).
The web app uses public Firebase configuration variables; copy
`apps/web/.env.example` to a local env file and set `NEXT_PUBLIC_USE_EMULATORS=1`
when running against emulators.

Useful commands:

- `pnpm verify` — lint, typecheck, dependency boundaries, and unit tests.
- `pnpm build:functions` — bundle Functions to `apps/functions/dist`.
- `pnpm test:emulator` — build Functions and run Auth, Firestore, Storage, and
  Functions emulator tests.
- `pnpm --filter web build` — build the Next.js web app.

`pnpm deploy:staging` exists, but do not run it. The staging project exists on
Spark with Firestore in `asia-south2`; deployment is blocked until the Phase 0B
security, billing, backup, and restore gates are approved.

## Repository map

- `apps/functions` — authenticated callable Functions and build entry point.
- `apps/web` — Next.js web app and Firebase sign-in gateway.
- `packages/domain` — pure accounting and lifecycle rules.
- `packages/application` — use cases and ports.
- `packages/contracts` — validated Firestore and callable contracts.
- `packages/infrastructure` — Firestore implementations.
- `firebase` — security rules and indexes.
- `docs` — architecture, ADRs, glossary, runbooks, and plans.
