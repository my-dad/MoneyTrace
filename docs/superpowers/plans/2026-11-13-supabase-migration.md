# Firebase → Supabase migration (CR-010) — checklist

**Goal:** MoneyTrace runs in production on Supabase (Postgres, Auth, Edge Functions) and Cloudflare
Pages, with no Google billing account, in 2 days. Every feature that works today works after.

**Rule:** every test that passes today passes after. A Firebase-specific test is replaced by its
Supabase equivalent, never deleted. Domain, application and contracts code is not changed.

**Owners:** `[Claude]` builds, `[Mabrur]` account steps (keys never shared in chat), `[Together]` live steps.
**Schedule:** Day 1 = Phases 0–3. Day 2 = Phases 4–7. Phase 8 runs in the week after go-live.

## Resume protocol (usage limits and interruptions)

- After **every subtask**: tick it here, append one line to
  `docs/superpowers/progress/supabase-migration.md` (`<task> <subtask>: done, <commit>, <tests>`), commit both.
- Work in progress is committed as `wip:` before any long test run, so nothing lives only in memory.
- The progress file's last line always says one of: `next: <subtask>`, `blocked on Mabrur: <what>`, or `done`.
- An auto-resume check runs every 20 minutes while Claude Code is open. After a usage limit resets it
  reads the progress file, `git log` and `git status`, and continues from `next:`. It never passes a
  `blocked on Mabrur` line on its own.
- If Claude Code was closed: open it in this repo and say **"resume"**. The same files are the record.

---

## Phase 0 — Decision and setup

- [x] **T0.1 Record CR-010 in the PRD** `[Claude]`
  - [x] Proposed change, rationale (no billing account, so an attack can't run up a bill)
  - [x] Security impact (App Check removed; RLS replaces Firestore rules; encrypted backups)
  - [x] Cost impact (Supabase free plan, Cloudflare free plan, DeepSeek prepaid ≤ $10/mo)
  - [x] Acceptance criteria (this checklist's Phase 7 go-live rule)
  - [ ] Update `AGENT.md` locked stack, release checklist section C/D
  - [ ] Mabrur accepts CR-010
- [ ] **T0.2 Accounts** `[Mabrur]`
  - [ ] Supabase project, region Mumbai (ap-south-1); share only the project URL
  - [ ] Google Cloud OAuth client (no billing); paste its ID and secret into Supabase Auth → Google
  - [ ] Read DeepSeek's data terms; `supabase secrets set DEEPSEEK_API_KEY=…`
  - [ ] Cloudflare account; connect the GitHub repo to Pages
  - [ ] `age` key pair: public key → GitHub secret `BACKUP_AGE_PUBLIC_KEY`; private key kept offline
  - [ ] GitHub secrets: `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`
- [x] **T0.3 Workspace** `[Claude]`
  - [x] Branch `supabase-migration` from master
  - [x] Progress file `docs/superpowers/progress/supabase-migration.md`, updated after every task

## Phase 1 — Feasibility check (go / no-go, first 2 hours)

- [ ] **T1.1 Our code runs on Deno (Edge Functions)** `[Claude]`
  - [x] esbuild the composition root and one handler (`bootstrapUser`) to a single ESM file
  - [x] Run it under Deno locally; `node:crypto` hashing gives identical results
  - [ ] Deploy it as a test Edge Function; one call succeeds
- [ ] **T1.2 Postgres transactions from an Edge Function** `[Claude]`
  - [ ] Connect through the transaction pooler (port 6543, prepared statements off)
  - [ ] One serializable transaction with a forced conflict retries and succeeds
  - [ ] Measure CPU time per call (limit 2 s)
- [ ] **T1.3 Decide** `[Claude]`
  - [ ] Both pass → continue
  - [ ] Either fails → switch `/api` host to Cloudflare Workers (same code), note it in CR-010

## Phase 2 — Data layer on Postgres

- [x] **T2.1 Schema** `[Claude]`
  - [x] Migration: `docs(path pk, owner_id, collection, parent_path, data jsonb, updated_at)`
  - [ ] Indexes for every `where` / `orderBy` / `collectionGroup` query the adapters use (21 / 3 / 4)
  - [ ] RLS: select only `owner_id = auth.uid()` on read-model collections; no client insert/update/delete
  - [ ] Top-level collections (rate limits, deletion log, global AI counter) not readable by clients
- [x] **T2.2 Document store** `[Claude]`
  - [x] `DocStore` interface in infrastructure covering exactly what adapters use: get, getAll,
        create, set, update, delete, where, orderBy, limit, collectionGroup, runTransaction, Timestamp
  - [x] Postgres implementation: serializable transactions, retry on conflict (max 5, backoff)
  - [x] `create` fails on an existing doc, like Firestore
- [x] **T2.3 Test harness** `[Claude]`
  - [x] Local: PGlite (in-process Postgres, no Docker)
  - [ ] CI: real Postgres service container, migrations applied
- [x] **T2.4 Move all adapters (12 Firestore adapters; 23 files counting helpers)** `[Claude]`
  - [x] Adapters import `DocStore` instead of `firebase-admin/firestore`
  - [x] Ledger writer: atomic commit, correction, alsoPost, idempotency conflicts
  - [x] Source events, follow-ups, reconciliations, accounts, instruments, settings, read models
  - [x] AI quota counters, rate limiter (concurrency tests on real Postgres)
  - [x] All existing adapter contract tests green on Postgres

## Phase 3 — Backend API

- [ ] **T3.1 `/api` Edge Function** `[Claude]`
  - [ ] One router: `{name, data}` → handler; unknown name → not-found
  - [ ] Reuse the Zod contracts for input and output
  - [ ] Same error codes as today (not-found, already-exists, failed-precondition, resource-exhausted…)
  - [ ] CORS only for the Pages domain and localhost
- [ ] **T3.2 Auth and limits** `[Claude]`
  - [ ] Verify the Supabase JWT; require a verified email; `ownerId` = user id
  - [ ] Existing rate limits (30/min, 1000/day per user, 60/min per IP)
- [ ] **T3.3 Port all 24 commands** `[Claude]`
  - [ ] Setup: bootstrapUser, createAccount, createPaymentInstrument, recordOpeningBalance, updateSettings
  - [ ] Evidence: submitEvidence, confirmCandidate, retrySourceEvent, answerQuestion, cancelSourceEvent
  - [ ] Ledger: correctTransaction, recordCustodyTransfer, splitTransfer
  - [ ] Follow-ups: resolveFollowUp, snoozeFollowUp
  - [ ] Cash: recordReconciliation, recordAdjustment
  - [ ] Remaining registry commands (registry count = 24, checked by test)
- [ ] **T3.4 SMS pipeline** `[Claude]`
  - [ ] submitEvidence starts the pipeline in the background after the commit
  - [ ] A crash mid-pipeline is picked up by `recoverExpiredClaims` (test)
- [ ] **T3.5 Scheduled jobs** `[Claude]`
  - [ ] `pg_cron` + `pg_net` call `/api` with `CRON_SECRET` for: dispatchFollowUps,
        recoverExpiredClaims, resumeQuotaBlockedEvents, purgeProviderResults
  - [ ] Same intervals as today; a call without the secret is refused
- [ ] **T3.6 Rewrite the Firebase-only tests** `[Claude]`
  - [ ] Signed-out, wrong-token and unverified-email calls refused
  - [ ] Cross-user: user B can't read or change user A's data, through `/api` and through RLS
  - [ ] Per-command tests from the emulator suite, run against the new stack

## Phase 4 — Web app

- [ ] **T4.1 Supabase client** `[Claude]`
  - [ ] `supabase-js`; env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public by design)
- [ ] **T4.2 Sign-in** `[Claude]`
  - [ ] Google sign-in redirect, session restore, sign-out
  - [ ] Auth gate behaves as today (signed out → sign-in page)
- [ ] **T4.3 Reads** `[Claude]`
  - [ ] Read-model gateway on the `docs` table through RLS; same view models
- [ ] **T4.4 Commands** `[Claude]`
  - [ ] `commands.ts` calls `/api`; errors map to the same messages (`refused`, retry, offline)
- [ ] **T4.5 Hosting** `[Claude]`
  - [ ] Remove App Check from the client
  - [ ] Redirects from `firebase.json` → Cloudflare `_redirects`; security headers → `_headers`
- [ ] **T4.6 Tests** `[Claude]`
  - [ ] Web unit tests, demo-data e2e (5), full e2e (SMS → posted, cash count) all green

## Phase 5 — CR-009 essentials (open sign-up)

- [ ] **T5.1 Open sign-in** `[Claude]`
  - [ ] Remove the allowlist; any verified Google account
  - [ ] `OWNER_EMAIL` secret → $5/mo, $0.50/day; everyone else $1/mo, $0.20/day; saved at bootstrap
- [ ] **T5.2 Global AI cap** `[Claude]`
  - [ ] One counter, $10/mo, reserved in the same transaction as the user's own
  - [ ] Cap reached → SMS go to the visible pending queue; parsers keep working (test)
- [ ] **T5.3 Data notice** `[Claude]`
  - [ ] Shown at sign-in: app is in testing; unclear SMS text goes to DeepSeek
- [ ] **T5.4 Delete my account** `[Claude]`
  - [ ] Menu item; type "DELETE MY ACCOUNT" to confirm
  - [ ] Delete all the owner's rows; verify zero remain; delete the Auth user; log only a hash
  - [ ] Retry-safe; the pipeline and jobs skip a deleted owner (tests)

## Phase 6 — Platform and operations

- [ ] **T6.1 CI** `[Claude]`
  - [ ] Postgres service, migrations, Deno bundle check, all suites; required to merge
- [ ] **T6.2 Backups** `[Claude]`
  - [ ] Nightly GitHub Action: `pg_dump` → `age` encrypt → artifact (14-day retention)
  - [ ] Same job keeps the free project from pausing
- [ ] **T6.3 Restore drill** `[Together]`
  - [ ] Decrypt, restore into a scratch database
  - [ ] Row counts match; every transaction balances; balances match the live app
- [ ] **T6.4 Deploy scripts** `[Claude]`
  - [ ] `pnpm deploy:prod`: `supabase db push`, functions deploy, Pages build
  - [ ] Checklist of required secrets; deploy fails if one is missing
- [ ] **T6.5 Abuse check** `[Together]`
  - [ ] Cross-user read against production refused
  - [ ] No secrets in the web bundle; logs hold no SMS text or emails
  - [ ] Rate limits trigger on a burst

## Phase 7 — Go-live

- [ ] **T7.1 Deploy to production** `[Together]`
- [ ] **T7.2 Smoke test** `[Together]`
  - [ ] Sign in on your phone; data notice shows
  - [ ] One real SMS from each of your banks posts correctly
  - [ ] An unclear SMS goes through DeepSeek; with DeepSeek blocked it waits in the pending queue
  - [ ] Cash count and Adjust work
- [ ] **T7.3 Install the PWA on your phone** `[Mabrur]`
- [ ] **T7.4 Go / no-go** `[Together]`
  - [ ] All tests green, restore drill matched, every bank's SMS posted — otherwise no ship
  - [ ] Release checklist updated
- [ ] **T7.5 Invite friends and family** `[Mabrur]`

## Phase 8 — Cleanup (week after go-live)

- [ ] **T8.1 Remove Firebase** `[Claude]`
  - [ ] Delete Firebase code, packages, `firebase.json`, rules, emulator config
  - [ ] Search for `firebase` in the code returns nothing
- [ ] **T8.2 Docs** `[Claude]`
  - [ ] Architecture doc, ADR for CR-010, `AGENT.md` commands
- [ ] **T8.3 Deferred items** `[Claude]`
  - [ ] Cloudflare Turnstile captcha at sign-in
  - [ ] Review whether nightly backups are enough once real data grows
