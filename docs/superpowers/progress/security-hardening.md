# Security hardening

Branch `security-hardening` (started 2026-11-27). Mabrur asked what security measures a financial
app needs; this branch does the code-side items. Account items (2FA on Supabase, Cloudflare,
GitHub, DeepSeek) and release-checklist C3, D5, D6, B2 are Mabrur's.

## Tasks

- [x] 1. Content-Security-Policy and HSTS. `apps/web/scripts/write-csp.mjs` runs after `next build`
  and adds a CSP to `out/_headers`: scripts only from our origin plus the hashed inline scripts
  Next emits, connections only to our site and our Supabase project, no eval, plugins or framing.
  `public/_headers` adds HSTS and `Cross-Origin-Opener-Policy`. `e2e/csp-guard.ts` fails any
  browser test in which the CSP blocked something (checked: it fails when the hashes are removed).
  Evidence: `pnpm verify` 2112 passed; `pnpm test:e2e:fixture` 12 passed; `pnpm test:e2e` 3 passed
  (a first run lost the local Edge Runtime container, exit 137, unrelated; rerun passed).
- [x] 2. Secret audit. Git history (all branches): no keys, only local `postgres:postgres` test
  URLs; `sms-pattern.md` (real SMS) never committed. Built bundle: only the public anon key.
  New `apps/web/scripts/check-bundle-secrets.mjs` runs after every build and fails it on a
  service_role or other non-anon Supabase JWT, `sb_secret_`, `sk-` keys, the age backup key, a
  database URL with a password, or a private key. `.gitignore` adds `*.key`, `*.age`. GitHub:
  secret scanning and push protection are on; Dependabot alerts off and `master` unprotected
  (Mabrur's settings, B2). Evidence: `pnpm verify` 2117 passed; a real build prints
  `check-bundle-secrets: … no secrets`.
- [x] 3. Identifier masking. Already sound: OTP, PIN, password and full (Luhn) card numbers are
  refused; 8+ digit runs are masked before storage and before any AI call (`ai-gateway.ts`,
  `intake-evidence.ts`, `answer-question.ts`). Gaps fixed in `maskIdentifiers`
  (`packages/domain/src/evidence/sensitive.ts`): numbers in groups ("1234-5678-9012",
  "017-1234-5678", 9+ digits so dates stay) and digits glued to an account label or placeholder
  ("A/C1234567890", "XXXX1234567890"). Transaction IDs (`BK00000003`), dates, amounts stay
  readable. Side effect: the source hash is taken over masked text, so an SMS in one of these
  formats pasted before and again after this change is not caught by the hash; matching still
  marks it a duplicate by reference or asks the user (same amount, account, time). Evidence:
  `pnpm verify` 2132 passed (parser corpus included).
- [x] 4. Logs. Already sound: `JsonLogger` emits only allowlisted fields whose values are
  ID-like tokens, so free text can't reach a log line; every call site logs error names, not
  messages; the web app never logs. Gap fixed: token verification, `getDeps` and scheduled jobs ran
  outside `/api`'s try, so their errors reached the platform, which prints the whole message (a
  Postgres error can quote the failing row). `createApiHandler` now catches everything, logs
  `api.unhandled` with the error name only, and answers `internal`. Evidence: `pnpm verify` 2134
  passed; `pnpm smoke:supabase` loads the bundle under Deno.

## Branch check (2026-11-28)

`pnpm verify` 2134 passed; `pnpm test:e2e:fixture` 12 passed; `pnpm test:e2e` 3 passed with the
CSP enforced and no violations; `pnpm smoke:supabase` OK. Merging deploys the CSP to production
through Cloudflare Pages: after merge, sign in on the live site and check the dashboard, chat and
Google photo load (browser console shows no "Content Security Policy" errors).
