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
| 2 Fixture household dataset | Done |
| 3 Mockup A navigation shell | Done (approved) |
| 4 Build A navigation shell | Done |
| 5 Mockup B activity | Drawn; awaiting Mabrur's approval |
| 6–14 Mockups/builds B–F | Not started |
| 15 UI-complete exit | Not started |

## Screen groups

| Group | Mockup | Mockup approved | Built | Tests |
|---|---|---|---|---|
| A Navigation shell | Drawn: `design/screens/A-navigation.html` | Approved 2026-11-12 (all 4 decisions as drawn) | Done | NavBar, Home header, AppShell, fixture smoke |
| B Activity / Inbox | Drawn: `design/screens/B-activity.html` | Awaiting Mabrur | — | — |
| C Accounts & Cash | — | — | — | — |
| D Reports | — | — | — | — |
| E Settings / Onboarding | — | — | — | — |
| F Reminders inbox | — | — | — | — |

## Next task

Mabrur reviews `design/screens/B-activity.html`. On approval: record it here, then Task 6 (build B).

## Open decisions

Mockup B asks Mabrur to confirm: amounts (out plain, in "+", moves neutral, nothing red); failed and rejected items stay listed; duplicates struck through as "Not counted twice"; Needs answer sends you to Chat; one Correct/Reverse sheet with a required reason; desktop shows list plus detail side by side.

## Noted for later (not in this plan)

- Desktop Home has no assistant panel yet (mockup screen 03 and A5 show one). Home itself is unchanged by this plan.
- The existing Home layout differs from mockup screen 01 (greeting, bank/cash split, card list). Home is unchanged by this plan.

## Last verification

Task 4 (2026-11-12): `pnpm verify` → 77 files, 1296 tests pass, no dependency violations. `pnpm --filter web build` → pass. `pnpm test:e2e:fixture` → 1 passed. The emulator E2E suite (`pnpm test:e2e`) was not run; it runs at Task 15.
