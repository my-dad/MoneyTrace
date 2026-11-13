# Release blockers

Everything that must be true before MoneyTrace holds real financial data. Sources: PRD §14 (release gates), §16 (0B gate), §18 (definition of done), CR-009 (open sign-up) and CR-010 (Supabase and Cloudflare Pages, no billing account). The step-by-step for going live is `docs/release/supabase-runbook.md`. Tick an item only with evidence (a commit, a test run, or a dated note).

History: code items were first ticked on 2026-11-13 for Firebase (branch `release-blockers`). CR-010 moved the backend to Supabase the same day; items below are re-read for it, and Firebase-only items (Blaze, App Check, Firebase backups) are marked superseded.

Owner: **Code** = buildable here and verified by tests. **Mabrur** = needs his Google, Supabase, Cloudflare or DeepSeek account. **Together** = Mabrur runs it while we check the result.

## A. Access and abuse (code)

- [x] A1 **Who can use it (CR-009):** any verified Google account; each person reaches only their own data. `/api` checks every token with Supabase Auth; row-level security lets clients read only their own rows and write nothing. Tests: `access.test.ts`, `api.test.ts`, `callable-auth.test.ts`, `cross-user.test.ts`, `read-policy.test.ts`. — Code
- [x] A2 **Google sign-in only.** Outside local test stacks, `/api` refuses anonymous or other providers and unverified emails. — Code
- [x] A3 ~~App Check~~ — superseded by CR-010 (dropped; a captcha at sign-in is deferred). On free plans an attack can cause downtime but no bill.
- [x] A4 **Per-user and per-IP rate limits** on every command, with tests; plus the CR-009 global AI cap (USD 10/month across all users). — Code
- [x] A5 **Request limits:** `/api` caps the body at 64 KB and allows only listed origins; the platform's free-plan limits stop rather than charge. — Code
- [ ] A6 **Sign-in works installed on a phone:** Supabase sign-in is a full-page redirect, the same in a tab and an installed app. — Code done. Remaining: check on a real phone (E3).

## B. Delivery (code)

- [x] B1 **Web hosting:** a static export on Cloudflare Pages; `public/_redirects` and `public/_headers` carry the old-route redirects and headers (`cloudflare-pages.test.ts`). — Code
- [ ] B2 **CI:** GitHub Actions runs `pnpm verify` and both web builds, the adapter suites on a real Postgres plus the `/api` bundle under Deno, and the browser suites (local Supabase and demo) on every PR. — Code done (`.github/workflows/ci.yml`). Remaining: Mabrur makes the three jobs required in branch protection.
- [x] B3 **Deploy command** `pnpm deploy:supabase`: refuses to run with a secret missing, then applies the migrations and deploys `/api`. — Code
- [x] B4 **Release gates 25–36** (27, 29, 30 deferred by CR-001) each mapped to a passing test:
  - 25 withdrawal: `strategies.test.ts`, `advance-source-event.test.ts`, `apps/functions/test/pipeline.test.ts`
  - 26 card purchase + partial repayment: same three, plus `firestore-ledger.store.test.ts`
  - 28 equal purchases stay separate: `matching.test.ts`, `advance-source-event.test.ts`
  - 31 follow-up scheduling: `follow-ups.test.ts`
  - 32 cash count discrepancy: `record-cash-count.test.ts`, `record-cash-adjustment.test.ts`, `callable-auth.test.ts`, `ChatScreen.test.tsx`, `e2e/sms-to-posted.spec.ts`
  - 33 edit via reversal: `follow-ups.test.ts`, `record-opening-balance.test.ts`
  - 34 AI budget exhausted: `advance-source-event.test.ts`, `apps/functions/test/pipeline.test.ts`
  - 35 cross-user isolation: `cross-user.test.ts` (through `/api`), `read-policy.test.ts` (through RLS)
  - 36 import cutover: `strategies.test.ts`, `record-opening-balance.test.ts`, `ledger-guards.test.ts`
- [x] B5 **"Not a transfer" undo** (CR-008 spec §9): `splitTransfer`; tests in `advance-source-event.test.ts`, `ChatScreen.test.tsx`, `e2e/sms-to-posted.spec.ts`. — Code
- [x] B6 **Account deletion (CR-009):** erases every owner collection and the login, keeps only a hash in the deletion log; survives in-flight SMS processing. Tests: `api.test.ts`, `cross-user.test.ts`. — Code

## C. Accounts (Mabrur) — runbook §1–2

- [x] C1 2FA on the Google account (Mabrur, 2026-11-13).
- [x] C2 ~~Blaze with budget and spend cap~~ — superseded by CR-010: no billing account anywhere.
- [ ] C3 DeepSeek data-processing terms read and accepted for real SMS text.
- [ ] C4 Supabase project (Mumbai), Google OAuth client, Cloudflare Pages project, sign-in URLs.
- [ ] C5 Secrets set by Mabrur, never pasted into chat: `CRON_SECRET`, `ALLOWED_ORIGINS`, `OWNER_EMAIL`, `DEEPSEEK_API_KEY` (Supabase secrets); `api_url` and `cron_secret` (Vault); `BACKUP_AGE_PUBLIC_KEY` and `SUPABASE_DB_URL` (GitHub). Backup private key kept offline.

## D. Going live (Together) — runbook §3–4

- [ ] D1 `pnpm deploy:supabase` succeeds; the web app is live from `master`.
- [ ] D2 Sign-in on a phone; the data notice shows.
- [ ] D3 Real SMS from each of Mabrur's banks post correctly.
- [ ] D4 An unclear SMS goes to DeepSeek; with DeepSeek blocked, it waits in the pending list.
- [ ] D5 Nightly encrypted backup runs; restore drill says `restore drill: PASS`.
- [ ] D6 Abuse check: another Google account can't see or change anything of Mabrur's; a burst of calls is rate-limited; a direct write with the anon key is refused.

## E. Pilot (Together)

- [ ] E1 DeepSeek's questions about unclear SMS make sense (`interpret-v2` has only met scripted and fake providers).
- [ ] E2 AI quota, metering and the global cap observed in production.
- [ ] E3 Installed PWA on Mabrur's phone: sign-in, paste, chat questions, dashboard, count my cash.

## Not blocking release

- Piece 3, tips from DeepSeek (ships right after launch unless Mabrur says otherwise).
- Receipts and OCR (CR-001); P1 reports, export, CSV import; push notifications (follow-ups already show in the chat); a captcha at sign-in.
- Deferred minors listed in `docs/superpowers/progress/`.
