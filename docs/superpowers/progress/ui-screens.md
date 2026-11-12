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
| 9 Mockup D reports | Done (approved) |
| 10 Build D reports | Done |
| 11 Mockup E settings and onboarding | Done (approved) |
| 12 Build E settings and onboarding | Done |
| 13 Mockup F reminders | Drawn; awaiting Mabrur's approval |
| 14 Build F reminders | Not started |
| 15 UI-complete exit | Not started |

## Screen groups

| Group | Mockup | Mockup approved | Built | Tests |
|---|---|---|---|---|
| A Navigation shell | Drawn: `design/screens/A-navigation.html` | Approved 2026-11-12 (all 4 decisions as drawn) | Done | NavBar, Home header, AppShell, fixture smoke |
| B Activity / Inbox | Drawn: `design/screens/B-activity.html` | Approved 2026-11-12 | Done | view model, screen, detail, correction sheet, smoke |
| C Accounts & Cash | Drawn: `design/screens/C-accounts.html` | Approved 2026-11-12 (all 6 decisions as drawn) | Done | view model, fixture cash source, home, detail, count flow, adjustment, allocation, smoke |
| D Reports | Drawn: `design/screens/D-reports.html` | Approved 2026-11-12 (all 6 decisions as drawn) | Done | fixture report source, screen (toggle, stepping, empty, error, unexplained line, null source, axe), smoke |
| E Settings / Onboarding | Drawn: `design/screens/E-settings.html` | Approved 2026-11-12 (all 7 decisions as drawn) | Done | settings source, settings screen, AI budget, reminders form, wizard, Home link, smoke |
| F Reminders inbox | Drawn: `design/screens/F-reminders.html` | Awaiting Mabrur | — | — |

## Next task

Mabrur reviews `design/screens/F-reminders.html`. On approval: record it here, then Task 14 (build F).

## Open decisions

Mockup F asks Mabrur to confirm: the ATM question worded "Where did the ৳5,000 go?" (cash with no place yet, not spending); Answer opens Chat with the question; snooze options 1 hour / tonight 9 pm / tomorrow 9 am with a Snoozed section; Done confirms and changes no money; empty reads "Nothing to answer".

## Noted for later (not in this plan)

- Desktop Home has no assistant panel yet (mockup screen 03 and A5 show one). Home itself is unchanged by this plan.
- The existing Home layout differs from mockup screen 01 (greeting, bank/cash split, card list). Home is unchanged by this plan.
- Account detail omits mockup C4's "Verified · matches the last SMS balance" badge: no read model says whether a balance matches an SMS yet.
- The setup name (step 1) isn't saved: `updateSettings` has no display-name field.
- Account history has no opening-balance line yet (mockup C4 shows one); the fixture history is built from source events only.

## Last verification

Task 12 (2026-11-12): `pnpm verify` → 96 files, 1399 tests pass, no dependency violations. `pnpm --filter web build` → pass. `pnpm test:e2e:fixture` → 5 passed. The emulator E2E suite runs at Task 15.
