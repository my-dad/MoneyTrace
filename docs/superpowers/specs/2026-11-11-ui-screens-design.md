# UI-first screens — design

Date: 2026-11-11. Status: approved in conversation by Mabrur; written spec awaiting review.
Branch: `ui-screens`, from `phase-1-sms-slice`. PRD change record: CR-005.
Progress file: `docs/superpowers/progress/ui-screens.md` (updated and committed after every task).

## 1. Intent

Mabrur wants every screen of the app built and reviewable **before** any further functionality.
Functionality (backend commands, pipelines, read models, contracts) resumes only after the UI is
complete.

Success means:

- Every PRD section 4 screen, plus the reminders inbox, exists in `apps/web`. Each has its loading,
  empty, error and populated states, and can be navigated on phone and desktop.
- Screens without a backend show typed fixture data behind the interface they will later read
  from, so wiring them later changes the data source, not the screen.
- No screen ever presents fixture data as real financial state.

Constraint from Mabrur: **UI only. Nothing extra.** No changes to `packages/domain`,
`packages/application`, `packages/contracts`, `packages/infrastructure`, `apps/functions` or
`firebase/` rules. `packages/ui-kit` may gain presentational components.

## 2. Scope

In scope:

| # | Group | Views |
|---|---|---|
| A | Navigation shell | Bottom tab bar (phone) and side rail (desktop): Home, Chat, Activity, Accounts, Reports. Settings icon and a reminders bell with a badge in the Home header. The Demo data marker. |
| B | Activity / Inbox | Chronological list. Filters: posted, pending, needs answer, duplicates. Transaction detail with its source evidence and match status. A Correct / Reverse sheet. |
| C | Accounts & Cash | Account list grouped as bank, cash, family-held cash, credit cards. Account detail with history. Linked debit instruments. A cash count and reconciliation flow. An adjustment form whose cause is required. A cash allocation (custody) form. |
| D | Reports | Toggle between calendar month and salary cycle. Income and expenses, category breakdown and trend, account movements, outstanding cards, discrepancies. |
| E | Settings / Onboarding | First-time setup wizard: identity, BDT and period preference, accounts, opening balances, reminders. Settings: AI budget and usage, reminder preferences, notifications, privacy. |
| F | Reminders inbox | Follow-up list with answer, snooze and done. |

Unchanged: Home, Chat and the existing account setup. The only change to them is placing them
inside the new shell and adding the two header icons to Home.

Out of scope: receipt or PDF upload UI (CR-001), CSV import, data export and deletion screens, the
Bangla language toggle (Phase 1 decision D4), and any backend work.

## 3. Mockups first

`design/MoneyTrace.html` covers only Home (English, Bangla, new user), Chat states 02.1–02.6,
desktop Home with the chat panel, PWA states, and the brand and components pages. It has no design
for groups A–F.

For each group, in order A → F:

1. Draw a static HTML mockup at `design/screens/<letter>-<name>.html`. It uses the `ui-kit` tokens
   (`packages/ui-kit/src/tokens.css`) and component styles, and shows phone (390 px) and desktop
   frames, one frame per state.
2. Mabrur reviews it. Changes are made until Mabrur approves it. **Nothing is built for a group before its
   mockup is approved.**
3. Build the group (section 4). Then update and commit the progress file.

The mockup for the next group may be drawn while the previous one is being reviewed or built.

Mockups follow the existing rules: unexplained cash is dashed and neutral, never red. The status
labels are `Verified`, `Pending` and `Needs answer`, and only posted items say "Recorded".

## 4. Fixture data seam

1. **Screens whose data already has contracts** (Activity, Accounts, Reminders) read through the
   existing `ReadModelGateway` (`apps/web/src/shared/read-model-gateway.ts`). In fixture mode, the
   existing in-memory gateway is seeded with one fixture dataset.
2. **Screens whose data has no contract yet** (Reports, reconciliation, cash counts, allocations,
   settings preferences, AI usage) each get a small typed source interface in their own feature
   folder, for example `features/reports/report-source.ts`, and a fixture implementation next to
   it. These are web-only view types, drafted from PRD section 9. They are **not** Zod contracts
   and do not go in `packages/contracts`. Real contracts are designed when functionality resumes.
3. **Actions with no backend** go through a fixture `Commands`. It never claims success. It
   answers with a visible "Not available yet — demo" status, so the honesty-of-state rule holds.
4. **One switch:** `NEXT_PUBLIC_DATA_SOURCE=fixture` selects the fixture gateway, the fixture
   sources and the fixture commands, and skips sign-in. `AppShell` then shows a persistent **Demo
   data** marker. Without the flag, the existing Firebase wiring is unchanged.
5. **Guard:** `next.config.ts` fails the build if fixture mode is on and the Firebase project ID
   does not start with `demo-`. A fixture build can never point at a real project.

All fixture money is integer minor units (poisha) in BDT, matching the existing conventions. The
fixture dataset is one coherent household: its bank, cash, card and report figures agree with each
other.

## 5. Testing

- A component test for every screen state (loading, empty, error, populated), following
  `HomeScreen.test.tsx`.
- One Playwright smoke test in fixture mode. It visits every tab and the Settings and Reminders
  entry points on a phone viewport, and checks that the Demo data marker is visible.
- A test that fixture `Commands` never return a success status.
- After every task: `pnpm verify` and `pnpm --filter web build` pass, with their actual output
  reported. The existing emulator and E2E suites must keep passing.
- Accessibility: every control is keyboard reachable, touch targets are at least 44 px, status
  is shown as text and not only as color, and contrast uses the existing tokens.

## 6. Progress tracking

`docs/superpowers/progress/ui-screens.md` lists every task with its state, the next task, the open
decisions, and the last verification output. It is updated and committed as the last step of
every task, so work can resume after a usage-limit cutoff by reading that file first.

## 7. Deferred, not dropped

- CR-003 reviews (Phase 0 Task 12, web sign-in, restore drill tooling, whole-branch review) are
  due before functionality work resumes (CR-005).
- Phase 1's unmerged state, the live DeepSeek check, DeepSeek pricing and data-processing terms, and
  `aiAutoPostThresholdBp` tuning remain open items for the functionality phase.
