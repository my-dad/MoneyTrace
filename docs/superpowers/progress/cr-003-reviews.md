# CR-003 reviews: progress

Started 2026-11-12 on `phase-1-sms-slice`, after the UI-first work merged (`f7809b4`).
PRD CR-003 (moved by CR-005) requires these reviews before functionality work resumes, and before 0B.
Read this file first when resuming.

## Reviews

| # | Review | Scope | Reviewer | Status |
|---|---|---|---|---|
| 1 | Phase 0 Task 12, authenticated callables (gate 35) | `apps/functions/src/callable/*` at HEAD; original diff `3bade59..d548607` | Fresh reviewer (opus), read-only | Running |
| 2 | Web sign-in | `apps/web/src/features/auth/*`, Firebase wiring, fixture guard | Fresh reviewer (opus), read-only | Running |
| 3 | Restore drill tooling | `tools/restore-drill/*`, `docs/runbooks/restore-drill*.md` (`ebebf7f`) | Fresh reviewer (opus), read-only | Reported: with fixes (0 Critical, 5 Important, 8 Minor) |
| 4 | Phase 0 whole-branch review (0A gate) | `a4b05d2..master`, graded at HEAD | Fresh reviewer (opus), read-only | Running |

## How findings are handled

Each finding is re-graded by its effect on a person using the app. Critical and Important findings are fixed one at a time: write a test that reproduces the finding, watch it fail, fix it, then run the full suite. Minor findings are listed here as deferred. A finding that isn't fixed is recorded as a ruling with what it costs if wrong. Mabrur sees every ruling.

## Next task

Wait for the four review reports, then sort the findings and fix them.

## Findings

### Review 3: restore drill (with fixes)

Important (to fix):
1. `verify` defaults to the live `(default)` database, so a forgotten `--database` flag compares live data with itself and reports a match.
2. A leftover `FIRESTORE_EMULATOR_HOST` silently turns a staging drill into an emulator drill.
3. The seeded source event is `received`, so once Functions are deployed a trigger changes it before the backup. The runbook also doesn't fix the backup timing or describe cleanup.
4. The drill's seed and verify have never run in a test; only the checksum is tested.
5. The runbooks lack the backup schedule, PITR, backup listing, temporary-database deletion and Auth export commands. The restore syntax is probably wrong. "Stay on Spark" conflicts with backups needing Blaze.

Minor: 8 items (in the ledger), to be listed when the fixes are done.
