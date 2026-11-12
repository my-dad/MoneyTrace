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
| 13 Mockup F reminders | Done (approved) |
| 14 Build F reminders | Done |
| 15 UI-complete exit | Not started |

## Screen groups

| Group | Mockup | Mockup approved | Built | Tests |
|---|---|---|---|---|
| A Navigation shell | Drawn: `design/screens/A-navigation.html` | Approved 2026-11-12 (all 4 decisions as drawn) | Done | NavBar, Home header, AppShell, fixture smoke |
| B Activity / Inbox | Drawn: `design/screens/B-activity.html` | Approved 2026-11-12 | Done | view model, screen, detail, correction sheet, smoke |
| C Accounts & Cash | Drawn: `design/screens/C-accounts.html` | Approved 2026-11-12 (all 6 decisions as drawn) | Done | view model, fixture cash source, home, detail, count flow, adjustment, allocation, smoke |
| D Reports | Drawn: `design/screens/D-reports.html` | Approved 2026-11-12 (all 6 decisions as drawn) | Done | fixture report source, screen (toggle, stepping, empty, error, unexplained line, null source, axe), smoke |
| E Settings / Onboarding | Drawn: `design/screens/E-settings.html` | Approved 2026-11-12 (all 7 decisions as drawn) | Done | settings source, settings screen, AI budget, reminders form, wizard, Home link, smoke |
| F Reminders inbox | Drawn: `design/screens/F-reminders.html` | Approved 2026-11-12 (all 5 decisions as drawn) | Done | view model (split, snooze times), screen (sections, wording, answer link, snooze, done, empty, loading, error, axe), smoke |

## Next task

Task 15: UI-complete exit — run every suite (including `pnpm test:emulator` and `pnpm test:e2e`), compare screens to mockups, update AGENT.md status/commands, record open items. Then the final whole-branch review.

## Open decisions

None.

## Noted for later (not in this plan)

- Desktop Home has no assistant panel yet (mockup screen 03 and A5 show one). Home itself is unchanged by this plan.
- The existing Home layout differs from mockup screen 01 (greeting, bank/cash split, card list). Home is unchanged by this plan.
- Account detail omits mockup C4's "Verified · matches the last SMS balance" badge: no read model says whether a balance matches an SMS yet.
- The setup name (step 1) isn't saved: `updateSettings` has no display-name field.
- Reminders show the follow-up's stored question, not mockup F's short title plus "Taken from DBBL at an ATM on 5 Nov, 7:02 pm": that needs the target transaction joined in. The fixture question also says "yesterday's", which goes stale.
- Answer links to `/chat?followUp=<id>`; Chat doesn't read the parameter yet (open questions already appear in Chat's timeline).
- Done has no backend command (contracts can resolve a follow-up only with a destination or "not sure yet"), so it always reports "Not available yet".
- Account history has no opening-balance line yet (mockup C4 shows one); the fixture history is built from source events only.

## Last verification

Task 14 (2026-11-12): `pnpm verify` → 98 files, 1413 tests pass. `pnpm test:e2e:fixture` (builds the app) → 6 passed. The emulator E2E suite runs at Task 15.
