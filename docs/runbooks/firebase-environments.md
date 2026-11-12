# Firebase environments

This runbook covers the Phase 0B deployment gate. The repository supports the
local `demo-moneytrace` emulator project. Mabrur chose two real environments on
2026-11-13: **dev** and **prod** (no separate staging). The existing project
`moneytrace-staging` is the dev project (alias `dev`); its ID can't be renamed
and its Firestore database is already in `asia-south2`. Prod is not created yet.

## Security and billing decision

**Decision:** remain on the Spark plan for now. Do not upgrade to Blaze or
deploy real Functions until the following controls are implemented and tested:

- App Check enforcement for deployed callables.
- Sign-in limited to Mabrur's Google account: an allowlist in a `beforeUserCreated` blocking function or the shared callable wrapper. MoneyTrace is single-user, and the AI quota is per account, so any other account would get its own budget (CR-003 review).
- Anonymous sign-in rejected outside the emulator, both as a disabled provider and as a server-side check of `sign_in_provider` (CR-003 review).
- Sign-in fallback: use `signInWithRedirect` when the pop-up is blocked or the app runs installed (standalone), checked on a real phone, with `authDomain` same-site with the app (CR-003 review).
- Per-user and per-IP callable rate limits.
- Conservative Function `maxInstances`, concurrency, timeout, and minimum-instance settings.
- Separate Firebase projects for dev and prod (Mabrur, 2026-11-13).
- 2FA and least-privilege Google Cloud access; no committed service-account keys.
- A supported billing spend cap plus alerts for invocations, errors, Storage, egress, and AI usage.
- Emulator security tests and an abuse/penetration checklist run on dev.

The current code already authenticates callable requests, derives ownership from
the verified token, denies unauthorized Firestore/Storage access through rules,
and enforces application-level AI quotas. These are necessary but do not by
themselves prevent abuse through a valid account or stolen token.

Blaze has no fixed monthly fee, but it is pay-as-you-go. Alerts alone do not
stop spending, so the spend-cap and rate-limit controls are release gates, not
optional monitoring.

## Local emulator

Requirements are Node 22, pnpm 12.18.0, and JDK 21 or newer.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm test:emulator
```

The emulator command builds Functions, then starts Auth, Firestore, Storage,
and Functions using the ports in `firebase.json`. It does not contact a real
Firebase project.

## Dev gate

These steps require Mabrur's Google account and billing decision. Do not run
them from an automated agent.

1. Keep `moneytrace-staging` (alias `dev`) on Spark until the controls above are met; do not upgrade or deploy.
   Managed backups and point-in-time recovery need Blaze, so the restore drill
   (`restore-drill.md`) cannot run on dev until this changes.
2. The default Firestore database already exists in `asia-south2`; its location
   is permanent. Stop if any new environment cannot use the approved region.
3. Enable Google sign-in and verify the web authorized domains manually.
4. The repository alias is already configured:

   ```bash
   firebase use --add
   # alias: dev
   ```

5. Deploy the rules, Storage rules, and Functions only after the temporary
   region smoke functions have been prepared and reviewed.
6. Create a `smokeTests/{id}` document and confirm the `smokeResults/{id}`
   document and scheduled-function log entry. Record the observed trigger delay
   in `docs/adr/0004-region.md`.

If the trigger or schedule cannot deploy in `asia-south2`, stop before creating
dev or prod. Evaluate `asia-east2` for Functions with the existing database
only after discussing the result.

Functions currently declare `maxInstances: 2` for the source-event trigger and
`maxInstances: 1` for scheduled jobs. These limits are emulator-tested defaults,
not a substitute for the Phase 0B rate-limit and spend-cap review.

## Release configuration (per project)

These pair with `docs/release/release-checklist.md`. Run them as Mabrur; never paste a secret into chat.

1. **Allowlist (A1, A2).** `firebase functions:secrets:set ALLOWED_EMAILS --project <alias>`, value: the Google email(s) allowed in, comma-separated. Without it every callable refuses everyone (fails closed). The emulator ignores it.
2. **App Check (A3).** Register the web app with reCAPTCHA Enterprise in the Firebase console and put its site key in `apps/web/.env.production.local` as `NEXT_PUBLIC_APPCHECK_SITE_KEY` (a real build refuses to start without it). Callables enforce App Check from code; turn on enforcement for Firestore in the console too, after the first successful sign-in.
3. **Rate-limit cleanup (A4).** Add a Firestore TTL policy on collection group `rateLimits`, field `expiresAt`.
4. **Web config (B1).** `apps/web/.env.production.local` holds the project's `NEXT_PUBLIC_FIREBASE_*` values (see `apps/web/.env.example`). Set `authDomain` to the Hosting domain (for example `<project>.web.app`) so redirect sign-in stays same-site, and add that domain to Auth's authorized domains.
5. **Deploy (B3).** `pnpm deploy:dev` or `pnpm deploy:prod` builds Functions and the web export, then deploys rules, Functions and Hosting. A `prod` alias must be added to `.firebaserc` once the project exists.

## Prod

Create prod only after dev passes the region smoke test. Add aliases for
the actual project IDs; never commit credentials or service-account keys.
Configure billing alerts and confirm the default Cloud Logging bucket has
30-day retention. Alerts notify but do not cap spending.

The planned deployment command is intentionally not enabled yet. When real
projects exist, the documented sequence is:

```bash
pnpm deploy:dev
```

That command builds Functions and the web export, then deploys Firestore rules,
Storage rules, Functions and Hosting to the `dev` alias. Verify its flags and
target before first use.

## CI and branch protection

GitHub Actions and required checks are deferred. The local commands that must
eventually become merge-blocking are `pnpm verify`, `pnpm --filter web build`,
and `pnpm test:emulator`.
