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
| 15 UI-complete exit | Done |

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

Final review done (0 Critical, 6 Important fixed, 12 Minor deferred, listed below). Next: finishing-a-development-branch (Mabrur picks how to integrate).

Emulator suites need Java 21+. OpenJDK 21 is now the system default (installed 2026-11-12), so `pnpm test:emulator` and `pnpm test:e2e` run as written.

## Open decisions

None.

## Open items for the functionality phase

- CR-003 reviews still to do before the functionality phase starts.
- Real sources for `CashSource`, `ReportSource` and `SettingsSource` (fixture-only today; `null` outside fixture mode shows "Not available yet"), plus the read-model fields they need: per-account history with an opening-balance line, card statement dues, period report aggregates (categories, movements, unsettled items), and settings plus AI-usage views.
- Backend commands the UI already calls but which have no implementation: cash count, adjustment, allocation, and closing a follow-up without an answer ("Done").
- Merge Phase 1 (`phase-1-sms-slice`) before this branch is integrated.
- DeepSeek pricing and data-processing terms are to be checked before any real data.

## Deferred minors from the final review

- Done in Firebase mode says "demo"; reminders badge ignores expired snoozes; snooze times are fixed at page open.
- Accounts: phone keyboard order differs from visual order; Count cash can open with only unexplained cash; Give cash shows "Cash · place not set"; an overpaid card reads "−৳500 owed".
- Settings push switch is under the 44 px touch target; two forms prefill amounts with `minor / 100`.
- Demo dates drift after November 2026; demo Sign out does nothing visible.
- After a real correction the Activity list still shows the original as recorded (the sheet now says so); the read model needs to show reversals.

## Screen walk (Task 15)

Every route was captured at 390 px and 1280 px in fixture mode: `/`, `/chat`, `/activity` (list and detail), `/accounts` (list, card detail, `/accounts/new`), `/reports`, `/settings` (list and AI budget), `/onboarding` and `/reminders`. No horizontal overflow and no page errors. Each screen matches its approved mockup, apart from the differences listed under "Noted for later".

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

Task 15 (2026-11-12): `pnpm verify` → 98 files, 1413 tests pass. `pnpm --filter web build` → pass. `pnpm test:e2e:fixture` → 6 passed. `pnpm test:emulator` (with Android Studio's Java 25) → core 8 files/440 tests pass, functions 2 files/24 tests pass. `pnpm test:e2e` → 2 passed. The emulator E2E suite runs at Task 15.
