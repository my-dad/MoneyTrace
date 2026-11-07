# Firebase environments

This runbook is prepared for Phase 0. The repository currently supports the
local `demo-moneytrace` emulator project. Staging, development, and production
projects are intentionally not created yet.

## Security and billing decision

**Decision:** remain on the Spark plan for now. Do not upgrade to Blaze or
deploy real Functions until the following controls are implemented and tested:

- App Check enforcement for deployed callables.
- Per-user and per-IP callable rate limits.
- Conservative Function `maxInstances`, concurrency, timeout, and minimum-instance settings.
- Separate Firebase projects for dev, staging, and prod.
- 2FA and least-privilege Google Cloud access; no committed service-account keys.
- A supported billing spend cap plus alerts for invocations, errors, Storage, egress, and AI usage.
- Emulator security tests and a staging abuse/penetration checklist.

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

## Staging gate

These steps require Mabrur's Google account and billing decision. Do not run
them from an automated agent.

1. Create a globally available project ID ending in `-staging` and upgrade it
   to Blaze. Do not use a project ID that the drill refuses.
2. Create the default Firestore database and Storage bucket in `asia-south2`.
   The Firestore location is permanent. Stop if that region is unavailable.
3. Enable Google sign-in and provide the project ID to the implementer.
4. Add the Firebase alias only after the project exists:

   ```bash
   firebase use --add
   # alias: staging
   ```

5. Deploy the rules, Storage rules, and Functions only after the temporary
   region smoke functions have been prepared and reviewed.
6. Create a `smokeTests/{id}` document and confirm the `smokeResults/{id}`
   document and scheduled-function log entry. Record the observed trigger delay
   in `docs/adr/0004-region.md`.

If the trigger or schedule cannot deploy in `asia-south2`, stop before creating
dev or prod. Evaluate `asia-east2` for Functions with the existing database
only after discussing the result.

## Dev and prod

Create these only after staging passes the region smoke test. Add aliases for
the actual project IDs; never commit credentials or service-account keys.
Configure billing alerts and confirm the default Cloud Logging bucket has
30-day retention. Alerts notify but do not cap spending.

The planned deployment command is intentionally not enabled yet. When real
projects exist, the documented sequence is:

```bash
pnpm deploy:staging
```

That command must build Functions and deploy Firestore rules, Storage rules,
and Functions to the `staging` alias. Verify its flags and target before first
use.

## CI and branch protection

GitHub Actions and required checks are deferred. The local commands that must
eventually become merge-blocking are `pnpm verify`, `pnpm --filter web build`,
and `pnpm test:emulator`.
