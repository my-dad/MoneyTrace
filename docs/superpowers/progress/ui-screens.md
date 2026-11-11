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
| 3 Mockup A navigation shell | Drawn; awaiting Mabrur's approval |
| 4–14 Builds A and mockups/builds B–F | Not started |
| 15 UI-complete exit | Not started |

## Screen groups

| Group | Mockup | Mockup approved | Built | Tests |
|---|---|---|---|---|
| A Navigation shell | Drawn: `design/screens/A-navigation.html` | Awaiting Mabrur | — | — |
| B Activity / Inbox | — | — | — | — |
| C Accounts & Cash | — | — | — | — |
| D Reports | — | — | — | — |
| E Settings / Onboarding | — | — | — | — |
| F Reminders inbox | — | — | — | — |

## Next task

Mabrur reviews `design/screens/A-navigation.html`. On approval: record it here, then Task 4 (build A). Mockup B may be drawn meanwhile.

## Open decisions

Mockup A asks Mabrur to confirm: (1) Home composer sits above the tab bar; (2) the desktop rail uses the same 5 destinations, with Cash and Cards folded into Accounts (screen 03 had separate Cash and Cards items), and Reminders and Settings at the rail's bottom; (3) the Demo marker is a top strip, not a floating badge; (4) the reminder badge counts open follow-ups only.

## Last verification

Task 2 (2026-11-12): `pnpm verify` → 76 files, 1289 tests pass, no dependency violations. `pnpm --filter web build` → pass.
