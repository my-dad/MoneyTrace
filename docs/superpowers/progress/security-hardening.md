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
- [ ] 2. Secret audit: git history, built bundle (no `service_role`, no DeepSeek key), repo settings.
- [ ] 3. Identifier masking: full account/card numbers never stored or sent to DeepSeek.
- [ ] 4. Logs: `/api` never logs raw SMS text, tokens or identifiers.
