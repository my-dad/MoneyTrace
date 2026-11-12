# CR-003 reviews: progress

Started 2026-11-12 on `phase-1-sms-slice`, after the UI-first work merged (`f7809b4`).
PRD CR-003 (moved by CR-005) requires these reviews before functionality work resumes, and before 0B.
Read this file first when resuming.

## Reviews

| # | Review | Scope | Reviewer | Status |
|---|---|---|---|---|
| 1 | Phase 0 Task 12, authenticated callables (gate 35) | `apps/functions/src/callable/*` at HEAD; original diff `3bade59..d548607` | Fresh reviewer (opus), read-only | Reported: with fixes (0 Critical, 2 Important, 8 Minor); no cross-user exploit found |
| 2 | Web sign-in | `apps/web/src/features/auth/*`, Firebase wiring, fixture guard | Fresh reviewer (opus), read-only | Reported: with fixes (1 Critical, 4 Important, 6 Minor) |
| 3 | Restore drill tooling | `tools/restore-drill/*`, `docs/runbooks/restore-drill*.md` (`ebebf7f`) | Fresh reviewer (opus), read-only | Reported: with fixes (0 Critical, 5 Important, 8 Minor) |
| 4 | Phase 0 whole-branch review (0A gate) | `a4b05d2..master`, graded at HEAD | Fresh reviewer (opus), read-only | Reported: with fixes (0 Critical, 3 Important, 7 Minor); all rulings stand |

## How findings are handled

Each finding is re-graded by its effect on a person using the app. Critical and Important findings are fixed one at a time: write a test that reproduces the finding, watch it fail, fix it, then run the full suite. Minor findings are listed here as deferred. A finding that isn't fixed is recorded as a ruling with what it costs if wrong. Mabrur sees every ruling.

## Next task

Fix pass done. Waiting for Mabrur on three decisions:
1. Opening-balance correction (callables I2): build it now, or in the functionality phase?
2. Sign-in I3 (allowlist / reject anonymous) and I4 (redirect fallback, checked on a phone): add to the 0B checklist?
3. ~~Backup retention~~ Done 2026-11-12: Mabrur asked for it to be configurable. It is `backupDays` in the retention policy (default 14 days, limit 98), with a `BACKUP_RETENTION_DAYS` override, and `pnpm backups:retention` feeds the runbook command.

Then: mark CR-003 complete in the PRD and the Phase 1 exit checklist.

## Fixes made (each test watched failing first, unless noted)

| Finding | Fix | Commit |
|---|---|---|
| Sign-in C1: bundle always used demo config | Literal `process.env.NEXT_PUBLIC_*` reads; a real build without config fails; checked that the real bundle carries the staging project | `faf65dd` |
| Sign-in I2: emulator mode on any project | Guard requires a `demo-` project; `test:e2e` pins `demo-moneytrace` | `faf65dd`, `d790f8d`* |
| Sign-in I1: Retry could mark the wrong user ready | Retry uses the same guarded bootstrap as the first attempt | `966489d` |
| Phase 0 I1: corrections dropped category and reference | Reversal mirrors the original; replacement takes its intent's category and keeps the reference | `3938513` |
| Phase 0 I3: reopen limit untested | Test added; fails when the limit is removed (code restored) | `05beaa0` |
| Phase 0 I2: false "review clean" line | Phase 0 ledger line annotated as corrected | (ledger, git-ignored) |
| Callables I1: thin isolation evidence | Emulator matrix: Bob calls all 13 callables with Alice's real ids; her whole tree is unchanged; coverage check for new callables. Code was already correct, so there was no failing run | `6241120` |
| Restore I1, I2 (+ minor 4) | `verify` on staging needs the restored database and refuses the live one; emulator host must match the project; arguments checked before writes | `8b96aa0` |
| Restore I3, I4 | Seeded event is terminal; new emulator test runs seed and verify, and catches a lost entry and a wrong balance | `8b96aa0` |
| Restore I5 | Runbooks rewritten with CLI-checked commands; states backups need Blaze | `a5f6620` |

\* The last commit also gives unit tests an explicit demo Firebase config.

Verification after the pass: `pnpm verify` 100 files / 1,436 tests; web build passes; `pnpm test:emulator` 444 + 26; `pnpm test:e2e` 2 passed; `pnpm test:e2e:fixture` 6 passed.

## Deferred minors

- Callables: account and instrument creation aren't idempotent; `updateSettings` before bootstrap returns internal; `documentId` looser than paths; deps resolved outside the try; two mapping paths untested; a repeated `resolveFollowUp` with a different destination reports success; currency mismatch reads as not found; unauthenticated calls aren't logged.
- Sign-in: demo builds still initialise Firebase; silent sign-out failure; no pending state on the sign-in button; gate screens lack heading, status role and focus handling; no error-code logging; no unit test for the Firebase gateway.
- Restore drill: a stray `cutoverMarkers/undefined` seed document; locale-dependent sort; weak balance check; dead code in `checksum.ts`; broad `-staging` guard; `deploy:staging` can run; whole `deletionLog` hashed.
- Phase 0: correction ids grow until about 15 chained corrections fail; a reversal rewrites the whole original; pending promotion drops the authorization's evidence; a quota reservation can leak; account check outside the ledger transaction; unbounded activity reads.

## Findings

### Review 1: Task 12 callables (with fixes)

No cross-user exploit was found: the owner comes only from the token, schemas are strict, every path is scoped by owner, and the rules deny all client writes.

Important:
1. The emulator tests don't prove isolation for most Phase 1 callables. Two "another user's" tests use ids that don't exist for anyone. Fix: a test matrix where Bob calls every callable with Alice's real ids, checks Alice's documents are unchanged afterwards, and fails when a new callable has no entry.
2. A wrong opening balance can never be corrected through any callable. This is a new capability, so it needs Mabrur's decision.

Minor: 8 items (in the ledger). Notes for 0B: restrict sign-up, or add a global AI spend cap, because the quota applies per user.

### Review 2: web sign-in (with fixes)

Critical:
1. `firebase.ts:6` reads config with `process.env[name]`, which Next.js never inlines, so every bundle runs on the demo config and real sign-in can never reach a real project. I confirmed this in the built chunk.

Important:
1. Retry after a failed setup marks the app ready without checking that the same user is still signed in.
2. `NEXT_PUBLIC_USE_EMULATORS=1` is accepted with any project ID, and `test:e2e` doesn't pin the demo project.
3. Any Google account (or the anonymous provider) is accepted by the server. MoneyTrace is single-user, so this needs an allowlist before 0B.
4. Sign-in is popup-only, which is unreliable in installed phone apps. It needs a redirect fallback, checked on a real device before 0B.

Minor: 6 items (in the ledger).

### Review 4: Phase 0 whole branch (with fixes)

Ledger invariants hold: integer money, balanced append-only entries, atomic idempotent posting, cutover protection, owner isolation, transactional quota.

Important:
1. A correction drops the transaction's category and reference, so correcting the same item twice moves the expense to "uncategorized". This is live at HEAD.
2. The Phase 0 ledger's "Task 12 … review clean" line is false and needs a correction note.
3. The bound that stops a stage from reopening forever (`stageAttempt < max * 2`) has no test.

Minor: 7 items (in the ledger).

### Review 3: restore drill (with fixes)

Important (to fix):
1. `verify` defaults to the live `(default)` database, so a forgotten `--database` flag compares live data with itself and reports a match.
2. A leftover `FIRESTORE_EMULATOR_HOST` silently turns a staging drill into an emulator drill.
3. The seeded source event is `received`, so once Functions are deployed a trigger changes it before the backup. The runbook also doesn't fix the backup timing or describe cleanup.
4. The drill's seed and verify have never run in a test; only the checksum is tested.
5. The runbooks lack the backup schedule, PITR, backup listing, temporary-database deletion and Auth export commands. The restore syntax is probably wrong. "Stay on Spark" conflicts with backups needing Blaze.

Minor: 8 items (in the ledger), to be listed when the fixes are done.
