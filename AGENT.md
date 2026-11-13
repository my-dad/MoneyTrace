# MoneyTrace — Agent Guide

Single source of truth for AI coding agents. `CLAUDE.md` is a symlink to this file. Edit only `AGENT.md`.

Source of product truth: `MoneyTrace_PRD_v1.0.md` (locked MVP baseline). If this file and the PRD disagree, the PRD wins; propose a PRD change rather than silently deviating.

## Project status

Phase 1's SMS vertical slice is implemented, whole-branch reviewed and merged to
`master` (2026-11-12; review record in
[`docs/superpowers/progress/phase-1-review.md`](docs/superpowers/progress/phase-1-review.md)).
It includes the authenticated chat, deterministic pipeline, and PWA shell. PRD
CR-003's outstanding reviews are complete. Production deployment remains blocked by
the Phase 0B gates, re-read for Supabase by CR-010. The Phase 0 plan is
[`docs/superpowers/plans/2026-11-06-phase-0-foundations.md`](docs/superpowers/plans/2026-11-06-phase-0-foundations.md);
the architecture source is
[`docs/superpowers/specs/2026-11-06-moneytrace-architecture-design.md`](docs/superpowers/specs/2026-11-06-moneytrace-architecture-design.md).

**CR-010 (accepted 2026-11-13): no Firebase.** Mabrur refused the Blaze plan, so the backend is
Supabase (Google sign-in, Postgres, one Edge Function `/api`, `pg_cron`) and the web app is on
Cloudflare Pages, all on free plans. Firestore-shaped documents live in one Postgres table behind
`DocStore`; the adapters kept their logic. Plan and progress:
[`docs/superpowers/plans/2026-11-13-supabase-migration.md`](docs/superpowers/plans/2026-11-13-supabase-migration.md),
[`docs/superpowers/progress/supabase-migration.md`](docs/superpowers/progress/supabase-migration.md).
Going live: [`docs/release/supabase-runbook.md`](docs/release/supabase-runbook.md).

The web app is a Google sign-in page and one dashboard with a pop-up chat (PRD
CR-007, piece 1 of 4; see
[`docs/superpowers/progress/dashboard-chat.md`](docs/superpowers/progress/dashboard-chat.md)).
The dashboard reads real read models; demo mode (`NEXT_PUBLIC_DATA_SOURCE=fixture`)
shows a fixed demo household and its actions save nothing. Piece 2 (PRD CR-008)
reads each SMS's source and remembers it (shown as chips), counts debits as Spent and
credits as Came in except paired own-account transfers, and lets DeepSeek ask up to 3
questions about an SMS it can't read clearly. Release gate 32 (count my cash, with an
audited Adjust) and the "Not a transfer" undo are built (see
[`docs/superpowers/progress/cash-count-undo.md`](docs/superpowers/progress/cash-count-undo.md)).
CR-009 (open sign-up for friends and family: global AI cap, data notice, account
deletion) is built. Next: going live on Supabase (piece 4), then piece 3 (tips from DeepSeek).

## What it is

Single-user, mobile-first PWA for evidence-driven personal/household finance tracking. The user pastes bank SMS, uploads receipts/screenshots/PDFs, or chats about cash. The system extracts evidence, deduplicates, validates, posts balanced ledger entries, and asks focused follow-up questions. Hybrid home screen: summary + pending items + always-available AI chat.

## Locked tech stack

- Frontend: Next.js + TypeScript (PWA, mobile-first)
- Backend (CR-010): Supabase Auth (Google), Postgres (documents as JSON behind `DocStore`, row-level security), one Edge Function `/api` (TypeScript on Deno), `pg_cron` for scheduled jobs
- Hosting (CR-010): Cloudflare Pages, static export
- AI: DeepSeek API behind an `AIProvider` interface. No custom model training.
- OCR: deferred by PRD CR-001. When resumed: replaceable `OCRProvider` adapter (benchmark Tesseract.js vs managed OCR on real Bangladesh receipts)
- Uploads: deferred by PRD CR-001. When resumed: private, short-lived storage (Supabase Storage after a change request)
- Reminders: scheduled backend jobs + FCM/web push; in-app inbox is the reliable fallback
- Currency: BDT first; **integer minor units only**
- Secrets: Supabase function secrets and Vault, set by Mabrur; no client-side API secrets

Do not swap or add major technologies without recording a change request (see Change control).

## Non-negotiable rules

### Accounting invariants
- Cash withdrawal: bank asset down, cash asset up. **Never an expense.**
- Giving cash to a family member / allocating cash changes custody, not expense.
- Credit-card purchase: expense + liability up. Repayment: bank down + liability down, **not an expense**.
- Debit cards are instruments linked to a bank account, not balance-bearing accounts.
- Card interest/fees are expenses; refunds reverse the relevant effects.
- Every posted transaction has balanced ledger entries, same currency. Ledger is append-only and immutable; corrections are reversal + replacement, atomically, with audit trail.
- Cash count discrepancies are never auto-categorized as spending; adjustments need explicit cause, authorization, audit.
- Never double-count pending authorizations and final postings.
- Opening balances are dated positions, not income/expense; later historical imports must not duplicate them.
- Never use floating point for money. Exact integer arithmetic only.

### AI / OCR boundaries
- AI never gets unrestricted DB access and **cannot directly mutate ledger balances**. It proposes; deterministic backend code validates and posts.
- OCR output is evidence, not accounting truth. Deterministic validation and matching decide.
- Parse known bank SMS patterns deterministically first; AI is the fallback. Unclear cases are explicitly marked for review.
- DeepSeek text API does not take raw images: OCR first.
- AI outputs must be schema-validated. Record model + prompt version and source-event IDs. Keep a regression corpus.
- Provider specifics (auth, model names, JSON handling, metering, timeouts, retries) live only inside adapters.

### Honesty of state
- Chat/UI must report the actual state (recorded / pending / failed). **Never claim success that was not confirmed.**
- Never silently drop uploads. Never post guessed amounts from unreadable receipts.
- Reminder wording must not imply unaccounted cash was necessarily spent.

### Security & privacy
- All ledger writes and third-party API calls go through `/api`. Clients never write the ledger (row-level security grants them reads only).
- Ownership check on every request; strict row-level security, tested per collection for cross-user access.
- Never request or store bank passwords, PINs, or OTPs. Minimize/redact card and account identifiers.
- Receipt originals: restrict size/MIME, store privately, delete after durable structured persistence, verify deletion, retry failures, auto-expire abandoned files.
- Structured logs only: no raw financial documents, no secrets, no PII dumps. Use correlated request IDs.
- Review third-party AI/OCR data-processing terms before sending real financial data.

### Idempotency & resilience
- Postings, reminders, and source-event ingestion must be idempotent and retry-safe (idempotency keys, source hashes).
- Bounded retries with backoff; dead-letter/review state for failures.
- AI quota exhausted or provider down: ledger, balances, reports, reminders, and deterministic parsers keep working; ambiguous evidence goes to a visible pending queue.
- Meter tokens and cost; enforce per-request, daily, monthly quotas (default target USD 5/month, model API only, configurable).

## Domain model (conceptual)

User, Account (bank / cash / family-held cash / credit liability), PaymentInstrument, SourceEvent, Transaction, LedgerEntry (append-only), CashAllocation, Reconciliation, FollowUp, Conversation, AIUsage, TemporaryUpload. See PRD §9 for fields.

## Screens

Sign-in page, then one dashboard (this month's spending, income, unexplained cash, spending by category, money now, recent messages; tips in piece 3) with a pop-up chat that also holds follow-up questions. PRD CR-007 replaces the separate §4 screens.

## Priorities

P0 (must): auth + data isolation, accounts/cash/cards, opening balances, SMS/chat ingest, AIProvider, dedup, atomic idempotent ledger, correct withdrawal/transfer/card flows, cash tracking, follow-ups, hybrid home, AI metering + fallback.
P1: inbox + reconciliation views, reports, export/deletion, CSV import.
Later: receipt OCR pipeline and receipt deletion (CR-001), auto SMS collection, email sync, family login, bank APIs, investments.

P1 work must never undermine ledger correctness.

## Delivery phases

0A Local foundations (auth, rules, ledger invariants, cost metering, on emulators) → 1 SMS vertical slice → 3 Reconciliation & reporting → 4 Hardening/pilot. 2 Receipt pipeline is deferred (CR-001). 0B Deployment gate (real projects, rate limits, encrypted backups and a restore drill, CI; CR-002, re-read for Supabase by CR-010) must pass before any deployment, real financial data, or the pilot. Each phase has an exit gate (PRD §16). Do not jump ahead of the current phase's gate.

## Testing expectations

- Ledger invariants need regression tests before features build on them (PRD §14 release gates 25–36 are the acceptance suite; 27, 29 and 30 are deferred by CR-001): ATM withdrawal, card purchase + partial repayment, SMS+receipt dedup into one expense, distinct equal-value purchases not collapsed, unreadable receipt, deletion verification, follow-up scheduling, cash discrepancy, edit via reversal, AI budget exhausted, cross-user isolation, import cutover.
- Adapter, `/api` and row-level-security suites run on Postgres: in-process PGlite in `pnpm test`, a real Postgres in CI. Test cross-user access explicitly, through `/api` and through RLS.
- Maintain fixtures: bank SMS samples, Bangla/English receipts (thermal, photos, screenshots, PDFs).
- Do not claim a task is done without running the relevant tests and reporting actual output.

## Conventions

- TypeScript strict mode. Validate all external input and all AI output with schemas.
- Money as integer minor units + currency code. No floats, no implicit rounding.
- Keep provider-specific code behind `AIProvider` / `OCRProvider`.
- Accessibility: keyboard-accessible chat, clear status text, adequate contrast, mobile touch targets.
- Slow OCR/AI work runs asynchronously with visible status; acknowledge immediately.
- Prefer small, reviewable changes. Don't add features, abstractions, or dependencies beyond the current phase's scope.

## Commands

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm --filter web build
pnpm test:e2e:fixture
pnpm test:e2e            # needs Docker: local Supabase
pnpm smoke:supabase
```

`pnpm verify` runs lint, all workspace typechecks, dependency-boundary checks,
and the unit test suite (Postgres suites included, on PGlite). `pnpm test:e2e:fixture`
builds the demo app and runs its browser paths (no backend). `pnpm test:e2e` starts a
local Supabase with our migrations, serves `/api` with a fake AI, builds the web app
with local (anonymous) sign-in and runs the browser suite. `pnpm smoke:supabase`
bundles `/api` and loads it under Deno. `pnpm deploy:supabase` is Mabrur's, run per
the runbook only after the 0B gate.

## Repository layout

```text
apps/functions/        Call gate, commands, jobs, `/api` handler and its bundle script
apps/web/              Next.js web app and auth gate
packages/domain/       Accounting rules and value objects
packages/application/  Use cases and ports
packages/contracts/    Zod schemas for persisted and callable data
packages/infrastructure/ Postgres document store, adapters and repositories
supabase/              Migrations (table, read policy, jobs, realtime) and the `/api` entry
tools/                 Backups and restore drill, deploy checks, local static server
tooling/               Boundary checks and test tooling
docs/                  Architecture, ADRs, glossary, and plans
```

`AGENT.md` is the source for this guide; `CLAUDE.md` is a symlink to it.

## Change control

Any change to the locked baseline (scope, stack, invariants) must record: proposed change, rationale, security/cost impact, acceptance criteria. Ask the user before making such a change.
