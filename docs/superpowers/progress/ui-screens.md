# UI-first screens — progress

Read this first when resuming. Updated and committed after every task.

- Spec: `docs/superpowers/specs/2026-11-11-ui-screens-design.md` (CR-005)
- Branch: `ui-screens` (from `phase-1-sms-slice`)
- Rule: UI only. No backend, contracts, rules or functions changes.

## Stage

| Stage | State |
|---|---|
| Brainstorm and design approval | Done (2026-11-11) |
| Written spec | Approved by Mabrur (2026-11-11) |
| Implementation plan | Approved by Mabrur (2026-11-11): `docs/superpowers/plans/2026-11-11-ui-screens.md` |
| Execution method chosen | Native (inline), 2026-11-11. Ledger: `.superpowers/sdd/2026-11-11-ui-screens/progress.md` (git-ignored) |

## Plan tasks

| Task | State |
|---|---|
| 1 App services and fixture mode | Done |
| 2 Fixture household dataset | Next |
| 3–14 Mockups and builds A–F | Not started |
| 15 UI-complete exit | Not started |

## Screen groups

| Group | Mockup | Mockup approved | Built | Tests |
|---|---|---|---|---|
| A Navigation shell | — | — | — | — |
| B Activity / Inbox | — | — | — | — |
| C Accounts & Cash | — | — | — | — |
| D Reports | — | — | — | — |
| E Settings / Onboarding | — | — | — | — |
| F Reminders inbox | — | — | — | — |

## Next task

Task 2: fixture household dataset.

## Open decisions

None.

## Last verification

Task 1 (2026-11-12): `pnpm verify` → 75 files, 1281 tests pass, no dependency violations. `pnpm --filter web build` → pass. Guard: fixture build with project `moneytrace-staging` fails with "Fixture mode requires a demo- Firebase project".
