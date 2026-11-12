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
| 5 Mockup B activity | Done (approved) |
| 6 Build B activity | Done |
| 7 Mockup C accounts and cash | Done (approved) |
| 8 Build C accounts and cash | Done |
| 9 Mockup D reports | Drawn; awaiting Mabrur's approval |
| 10–14 Build D, mockups/builds E–F | Not started |
| 15 UI-complete exit | Not started |

## Screen groups

| Group | Mockup | Mockup approved | Built | Tests |
|---|---|---|---|---|
| A Navigation shell | Drawn: `design/screens/A-navigation.html` | Approved 2026-11-12 (all 4 decisions as drawn) | Done | NavBar, Home header, AppShell, fixture smoke |
| B Activity / Inbox | Drawn: `design/screens/B-activity.html` | Approved 2026-11-12 | Done | view model, screen, detail, correction sheet, smoke |
| C Accounts & Cash | Drawn: `design/screens/C-accounts.html` | Approved 2026-11-12 (all 6 decisions as drawn) | Done | view model, fixture cash source, home, detail, count flow, adjustment, allocation, smoke |
| D Reports | Drawn: `design/screens/D-reports.html` | Awaiting Mabrur | — | — |
| E Settings / Onboarding | — | — | — | — |
| F Reminders inbox | — | — | — | — |

## Next task

Mabrur reviews `design/screens/D-reports.html`. On approval: record it here, then Task 10 (build D).

## Open decisions

Mockup D asks Mabrur to confirm: the Calendar month / Salary cycle toggle with arrows for earlier periods (cycle start day set in Settings); unexplained cash as its own neutral line, never in Spent; the trend as one sentence against the same days of the previous period; one bar per category with amounts; a "Not settled yet" list kept out of totals; an empty period before tracking started that says why.

## Noted for later (not in this plan)

- Desktop Home has no assistant panel yet (mockup screen 03 and A5 show one). Home itself is unchanged by this plan.
- The existing Home layout differs from mockup screen 01 (greeting, bank/cash split, card list). Home is unchanged by this plan.
- Account detail omits mockup C4's "Verified · matches the last SMS balance" badge: no read model says whether a balance matches an SMS yet.
- Account history has no opening-balance line yet (mockup C4 shows one); the fixture history is built from source events only.

## Last verification

Task 8 (2026-11-12): `pnpm verify` → 89 files, 1364 tests pass, no dependency violations. `pnpm --filter web build` → pass. `pnpm test:e2e:fixture` → 3 passed. The emulator E2E suite runs at Task 15.
