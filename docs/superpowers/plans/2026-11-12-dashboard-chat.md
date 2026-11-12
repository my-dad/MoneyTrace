# Dashboard and Pop-up Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the multi-screen web app with a Google sign-in page, one live dashboard, and a pop-up chat (piece 1 of PRD CR-007).

**Architecture:** Pure view models compute every figure from existing read models. `DashboardScreen` renders them. `ChatLauncher` wraps the existing `ChatScreen` in an accessible modal panel. Every other screen, route and fixture-only source is deleted, and old routes redirect to `/`. There are no backend, contract or rules changes.

**Tech Stack:** Next.js 16 app router, React 19, TypeScript strict, CSS modules, `@moneytrace/ui-kit`, Vitest + Testing Library + axe-core, Playwright 1.51.1, Firebase emulators (Java 21).

**Spec:** `docs/superpowers/specs/2026-11-12-dashboard-chat-design.md`

## Global Constraints

- Branch `dashboard-chat`, created from `phase-1-sms-slice`.
- After every task, update and commit `docs/superpowers/progress/dashboard-chat.md`, and append to `.superpowers/sdd/2026-11-12-dashboard-chat/progress.md` (git-ignored).
- Commit messages carry no Co-Authored-By or attribution lines. Refer to the user as Mabrur.
- Nothing is built before Mabrur approves the Task 1 mockup.
- No changes to `packages/*`, `apps/functions`, `firebase/firestore.rules` or contracts. `aiUsage` range reads use Firestore's automatic single-field index, so no index change is needed.
- Money is integer poisha, displayed with `formatBdt`. There is no float arithmetic on money. Bar widths are integer percents (`Math.round(amount * 100 / max)`).
- Months are calendar months in Asia/Dhaka, fixed UTC+6.
- Unexplained cash (`cash-unassigned`) is never added to Spent, never shown in red, and is shown only when above 0.
- Card owed = the sum over `creditLiability` balances of `max(0, -debitMinusCreditMinor)`.
- Comparison line:
  - Current month: compared with the same elapsed time of the previous month, as "৳X more than this time last month" / "৳X less than this time last month" / "Same as this time last month".
  - Past months: compared whole month with whole month, as "৳X more than September" / "less" / "Same as September".
  - No line when the previous month has nothing recorded.
- Recent status labels:
  - `posted` → "Recorded"
  - waiting for the user → "Waiting for your answer"
  - `deadLetter` → "Couldn't read"
  - `pending` → "In progress"
  - `rejected` / `cancelled` / `linkedAsDuplicate` → "Not counted"
- AI budget menu line: "$1.43 of $5.00 this month". The limit constant `MONTHLY_AI_LIMIT_MICRO_USD = 5_000_000` lives in web, because web cannot import `@moneytrace/application`; the code comment says this mirrors the application quota default. Spend is the sum of `actualMicroUsd ?? estimatedMicroUsd` over this month's `aiUsage` rows.
- Demo actions still answer `COPY.demoUnavailable` ("Not available yet — demo · nothing was saved").
- Accessibility: every screen passes axe. The chat panel uses `useModalFocus` (focus in, Tab trap, Escape closes, focus returns). Touch targets are at least 44 px.

## Review Focus

1. **A transaction just after midnight on the 1st, Dhaka time** (`2026-11-01T00:30+06:00`, which is still 31 Oct in UTC) belongs to November. Test in Task 3.
2. **A refund larger than the month's spending in a category** must not draw a negative bar. That category is left out of the chart, and Spent shows the signed net total. Test in Task 3.
3. **Before the first snapshot,** the dashboard must show "Loading…", never ৳0 and never the new-user message. Test in Task 5.
4. **A card in credit** (positive liability balance) adds 0 to "Cards owed", never a negative. Test in Task 3.
5. **A snoozed question whose snooze has passed** counts in the chat badge, like an open one. Test in Task 6.

---

### Task 1: Dashboard and chat mockup (Mabrur's approval gate)

**Files:**
- Create: `design/screens/G-dashboard.html`
- Create: `docs/superpowers/progress/dashboard-chat.md`

- [ ] **Step 1: Create the branch and the progress file.** Run `git switch -c dashboard-chat phase-1-sms-slice`. Then create the progress file listing Tasks 1–9 with their states, the next task, the open decisions, and the last verification.
- [ ] **Step 2: Draw the mockup.** Base it on the style of the previous mockups (`design/screens/F-reminders.html`, ui-kit tokens). Draw these frames:
  - G1: phone dashboard, populated with the demo figures (Spent ৳18,640; Came in ৳85,000; Cash not yet explained ৳5,000; categories Groceries 6,820 / Other 5,730 / Transport 3,150 / Eating out 2,940; "৳1,740 more than this time last month"; Money now; Recent with each status label; chat button with badge 2).
  - G2: phone, new user.
  - G3: phone, loading and read-failure bar.
  - G4: phone, menu open (AI budget line and Sign out).
  - G5: phone, chat open full-screen.
  - G6: desktop with the chat panel open on the right.
  - G7: a month with nothing recorded.
  - G8: the sign-in page.

  End with a "Decisions to confirm" list.
- [ ] **Step 3: Render and check it.** Run `node $SCRATCH/mock.cjs design/screens/G-dashboard.html $SCRATCH/G.png`. Expected: no clipping is reported. Send the PNG to Mabrur.
- [ ] **Step 4: Commit** (`design: add dashboard and chat mockup`) and STOP. Do not start Task 2 until Mabrur approves. Record the approval and any requested changes in the progress file.

### Task 2: Read models for income and AI usage, the demo clock, and demo data

**Files:**
- Modify:
  - `apps/web/src/shared/read-model-gateway.ts`
  - `firebase-read-model-gateway.ts`
  - `in-memory-read-model-gateway.ts`
  - `shared/fixtures/household.ts`
  - `shared/fixtures/fixture-read-models.ts`
  - `shared/app-services.tsx`
- Test:
  - `apps/web/src/shared/in-memory-read-model-gateway.test.ts` (create if absent)
  - `apps/web/src/shared/fixtures/household.test.ts`

**Interfaces:**
- Produces:
  - `type LedgerEntryRow = z.output<typeof OWNER_COLLECTIONS.ledgerEntries>`. Keep `ExpenseEntryRow` as an alias of it.
  - `type AiUsageRow = z.output<typeof OWNER_COLLECTIONS.aiUsage>`
  - `ReadModelGateway.watchIncomeEntries(fromMs, toMs, onValue: (rows: LedgerEntryRow[]) => void, onError?) => () => void`, querying `accountKind == "income"` with the same shape as `watchExpenseEntries`.
  - `ReadModelGateway.watchAiUsage(fromMs, toMs, onValue: (rows: AiUsageRow[]) => void, onError?) => () => void`, querying `createdAtMs` between the bounds, ordered by `createdAtMs`.
  - `InMemoryReadModelGateway.setIncomeEntries(rows)` and `setAiUsage(rows)`, with the same filtering by range as the expense rows.
  - `AppServices.nowMs: () => number`. Fixture mode returns `FIXTURE_NOW_MS` (2026-11-06 20:00 Dhaka); Firebase mode returns `Date.now`.
  - Demo data (`household.ts`):
    - `FIXTURE_INCOME_ENTRIES`: one salary entry, ৳85,000, `2026-11-01T10:00:00+06:00`, account `income-salary`.
    - October expense entries added to `FIXTURE_EXPENSE_ENTRIES`, each at 10:00 Dhaka time, in this order: groceries 6,100 (Oct 3), other 5,200 (Oct 4), transport 2,950 (Oct 5), eating-out 2,650 (Oct 6), groceries 12,800 (Oct 20), other 10,400 (Oct 21), transport 6,750 (Oct 22), eating-out 5,450 (Oct 23). October totals 16,900 up to Oct 6 and 52,300 for the whole month.
    - `FIXTURE_AI_USAGE`: November rows summing to 1,430,000 µUSD.
    - Account names lose their card digits: "City Bank Amex" and "EBL Visa".
    - `FIXTURE_FOLLOW_UPS` keeps fu-atm (open), fu-wallet (open) and fu-home-count (snoozed until 1 Dec).

- [ ] **Step 1: Write the failing tests.**
  - `in-memory gateway delivers income and AI usage within the range`: set two income rows, one inside and one outside `[from, to]`. Assert only the inside row is delivered, and that `setIncomeEntries` pushes to live listeners.
  - `demo household has no card digits in account names`: `FIXTURE_ACCOUNTS.every(a => !/\d{3,4}/.test(a.name))`.
  - `demo October and November figures`: the sum of November expense debits is 1_864_000. The sum of October expense debits with `occurredAtMs <= Oct 6 20:00 Dhaka` is 1_690_000. The October total is 5_230_000. The AI usage sum is 1_430_000.
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm --filter web exec vitest run src/shared`. Expected: FAIL (`setIncomeEntries` is not a function; digits are present).
- [ ] **Step 3: Implement the interfaces above.** Fix any test fixtures that named "City Bank Amex ••7702" to use the new names.
- [ ] **Step 4: Run the checks.** Run: `pnpm --filter web exec vitest run src/shared && pnpm --filter web exec tsc --noEmit -p .`. Expected: PASS.
- [ ] **Step 5: Commit** (`feat(web): read income and AI usage; demo clock and data`). Update the progress file.

### Task 3: Dashboard view model

**Files:**
- Create: `apps/web/src/features/dashboard/dashboard-view-model.ts`, `dashboard-view-model.test.ts`

**Interfaces:**
- Consumes: Task 2 row types, plus `SYSTEM_CASH_ACCOUNT_ID` (move it here from `features/home/home-view-model.ts`; Task 8 deletes that file).
- Produces:
  - `monthRange(nowMs: number, offset: number): { fromMs: number; toMs: number; label: string }`. `offset` 0 = the current Dhaka month, −1 = the previous one. `label` is "November 2026". `toMs` is the last ms of the month.
  - `type CategoryRow = { category: string; amountMinor: number; percent: number }`
  - `type DashboardView = { spentMinor: number; incomeMinor: number; unexplainedCashMinor: number; availableMinor: number; cardsOwedMinor: number; categories: CategoryRow[]; comparison: string | null; hasActivity: boolean }`
  - `buildDashboard(input: { balances: BalanceRow[]; expenses: LedgerEntryRow[]; income: LedgerEntryRow[]; previousExpenses: LedgerEntryRow[]; nowMs: number; offset: number; previousLabel: string }): DashboardView`. The screen passes the whole previous month as `previousExpenses`. For `offset === 0`, `buildDashboard` itself keeps only entries at or before "`nowMs` one calendar month earlier", meaning the same day-of-month and time, clamped to that month's last day. For past months it compares whole months.
  - `aiSpendLabel(rows: AiUsageRow[]): string`, which returns, for example, "$1.43 of $5.00 this month". It owns `MONTHLY_AI_LIMIT_MICRO_USD`.

- [ ] **Step 1: Write the failing tests** (fixtures from Task 2; `NOW = FIXTURE_NOW_MS`):
  - `figures for November so far`: spentMinor 1_864_000; incomeMinor 8_500_000; unexplainedCashMinor 500_000; categories `["groceries","other","transport","eating-out"]` with percent `[100, 84, 46, 43]`; comparison "৳1,740 more than this time last month".
  - `a past month compares whole months`: offset −1 gives spentMinor 5_230_000 and comparison null (nothing before October).
  - `counts 00:30 on the 1st in Dhaka as the new month`: an expense at `2026-11-01T00:30:00+06:00` is inside `monthRange(NOW, 0)`.
  - `leaves out a category whose refunds exceed its spending, and keeps Spent signed`: groceries debit 1_000 and credit 3_000 give no groceries row and spentMinor −2_000.
  - `a card in credit owes nothing`: liability balances −1_845_000 and +50_000 give cardsOwedMinor 1_845_000.
  - `hides negative unexplained cash`: a `cash-unassigned` balance of −100 gives unexplainedCashMinor 0.
  - `availableMinor sums bank, cash (including the system wallet, as the approved Accounts mockup did) and family cash`: the demo gives 15_020_000.
  - `hasActivity is false with no entries`.
  - `aiSpendLabel sums actual, falling back to estimate`: rows `{actual: 1_000_000}` and `{estimated: 430_000}` give "$1.43 of $5.00 this month".
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm --filter web exec vitest run src/features/dashboard/dashboard-view-model`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement it.** The category id is `accountId` without its `expense-` prefix. Net = debits − credits. Sort by amount, descending. Percent is relative to the largest positive category.
- [ ] **Step 4: Run them and confirm they pass.** Expected: PASS.
- [ ] **Step 5: Commit** (`feat(web): add dashboard view model`). Update the progress file.

### Task 4: Recent items

**Files:**
- Create: `apps/web/src/features/dashboard/recent-items.ts`, `recent-items.test.ts`. Move `toActivityItems` and its row-description helpers here from `features/activity/activity-view-model.ts`, keeping its existing tests that still apply.

**Interfaces:**
- Produces: `type RecentItem = { id: string; title: string; detail: string; amountMinor: number | null; status: "recorded" | "waiting" | "inProgress" | "failed" | "notCounted"; statusLabel: string }` and `toRecentItems(events: SourceEventRow[], accounts: AccountRow[], limit: number): RecentItem[]`. Labels follow Global Constraints.

- [ ] **Step 1: Write the failing tests.**
  - `maps each event status to its label`: one event per status gives the labels from Global Constraints.
  - `"Recorded" only for posted`.
  - `keeps at most limit items, newest first`.
  - `a withdrawal reads as a transfer, not spending`: the fixture ATM event's title contains "Bank → Cash".
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm --filter web exec vitest run src/features/dashboard/recent-items`. Expected: FAIL.
- [ ] **Step 3: Implement it.** The waiting status covers `pending` events with an awaiting-user reason, and events linked to an open follow-up.
- [ ] **Step 4: Run them and confirm they pass.** Expected: PASS.
- [ ] **Step 5: Commit** (`feat(web): add recent items for the dashboard`). Update the progress file.

### Task 5: Dashboard screen

**Files:**
- Create in `apps/web/src/features/dashboard/`: `DashboardScreen.tsx`, `MonthSwitch.tsx`, `CategoryChart.tsx`, `RecentList.tsx`, `AccountMenu.tsx`, `dashboard.module.css`, and their tests (`DashboardScreen.test.tsx`, `AccountMenu.test.tsx`).
- Modify:
  - `apps/web/src/app/page.tsx`: render `DashboardScreen`.
  - `shared/copy.ts`: add `DASHBOARD_COPY`.

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: `DashboardScreen({ gateway: ReadModelGateway; nowMs: number; displayName?: string; onSignOut: () => void })`. It renders `<main>` with an `h1` "MoneyTrace" (visually the top bar) and a `section` "Tips" that stays empty (the piece 3 spot, `aria-hidden`).

- [ ] **Step 1: Write the failing tests** (in-memory gateway seeded with the demo household):
  - `shows this month's figures`: "Spent ৳18,640", "Came in ৳85,000", and a `role="note"` reading "Cash not yet explained ৳5,000".
  - `steps to October and back`: › is disabled at offset 0; ‹ shows "October 2026" and "Spent ৳52,300".
  - `charts categories largest first`: the list items read "Groceries ৳6,820", "Other ৳5,730", "Transport ৳3,150", "Eating out ৳2,940".
  - `shows Loading and never ৳0 before the first snapshot`: with a gateway that never emits, a "Loading…" status is shown and there is no "৳" text and no new-user message.
  - `shows the new-user message when nothing is recorded`: the text is "Paste a bank SMS or tell me about a purchase to get started".
  - `shows the read-failure bar and keeps loaded figures`.
  - `a month with nothing recorded says so`: "Nothing recorded in September 2026".
  - `recent shows statuses`: "Recorded" and "Waiting for your answer" are both present.
  - `menu shows AI spend and signs out`: opening the menu shows "$1.43 of $5.00 this month", and clicking "Sign out" calls `onSignOut`.
  - `has no axe violations`.
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm --filter web exec vitest run src/features/dashboard`. Expected: FAIL.
- [ ] **Step 3: Implement to the approved mockup.** `page.tsx` passes `services.nowMs()`, `useAuthUser()?.displayName`, and `auth.signOut`. In fixture mode, Sign out shows `COPY.demoUnavailable` (this closes a deferred minor).
- [ ] **Step 4: Run the checks.** Run: `pnpm --filter web exec vitest run src/features/dashboard && pnpm --filter web exec tsc --noEmit -p .`. Expected: PASS.
- [ ] **Step 5: Screenshots.** Run a fixture build and capture `/` at 390 and 1280 px. Compare them with mockup G1/G6 and note any differences in the progress file.
- [ ] **Step 6: Commit** (`feat(web): add the dashboard`). Update the progress file.

### Task 6: Chat launcher and panel

**Files:**
- Create: `apps/web/src/features/chat/ChatLauncher.tsx`, `ChatLauncher.test.tsx`, `launcher.module.css`.
- Modify:
  - `features/chat/ChatScreen.tsx`: add an `embedded?: boolean` prop that renders a `div` instead of `main` and omits the app header.
  - `features/shell/AppShell.tsx`: render `<ChatLauncher />` after the content.

**Interfaces:**
- Produces: `ChatLauncher({ gateway: ReadModelGateway; commands: ChatCommands; nowMs: number })`. It renders a button named "Open chat" (or "Open chat, 2 questions waiting" when there are open questions). Its panel is `role="dialog"` named "Chat", using `useModalFocus` and containing `<ChatScreen embedded />`. `openQuestionCount(rows: FollowUpRow[], nowMs: number): number` is exported. It counts rows that are `open`, or `snoozed` with `snoozedUntilMs <= nowMs`.

- [ ] **Step 1: Write the failing tests.**
  - `opens, traps focus, closes on Escape and returns focus`.
  - `badge counts open and expired-snooze questions`: fixture follow-ups at a `nowMs` after 1 Dec give 3. At `FIXTURE_NOW_MS` they give 2.
  - `sending in the demo shows the demo status inside the panel`.
  - `the panel has one main landmark in the page` (the embedded chat renders no second `main`).
  - `has no axe violations when open`.
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm --filter web exec vitest run src/features/chat/ChatLauncher`. Expected: FAIL.
- [ ] **Step 3: Implement it.** The panel is full-screen below 1024 px and a 420 px right panel at 1024 px and above. The dashboard stays interactive behind the desktop panel, but the dialog is still modal for focus.
- [ ] **Step 4: Run the checks.** Run: `pnpm --filter web exec vitest run src/features/chat`. Expected: PASS, including the existing ChatScreen tests.
- [ ] **Step 5: Commit** (`feat(web): add the pop-up chat`). Update the progress file.

### Task 7: Sign-in page

**Files:**
- Modify: `apps/web/src/features/auth/AuthGate.tsx`, `AuthGate.test.tsx`, and add `auth.module.css`.

**Interfaces:**
- Produces the copy:
  - `h1` "MoneyTrace"
  - the line "Paste your bank SMS or tell it about cash. It works out where your money goes."
  - the button "Sign in with Google" (ui-kit `Button`)
  - the progress texts "Checking your sign-in status" and "Setting up your account", each in `role="status"` inside `main`.

- [ ] **Step 1: Write the failing tests.**
  - `the sign-in page has a heading, the line and the button`.
  - `progress text is announced` (`role="status"`).
  - `the sign-in button is disabled while a sign-in is in flight`, so a double tap opens one pop-up.
  - `closing the pop-up shows no error`: `auth/popup-closed-by-user` leaves no alert.
  - `has no axe violations`.

  The existing gate tests keep passing.
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm --filter web exec vitest run src/features/auth`. Expected: FAIL.
- [ ] **Step 3: Implement it.** The gateway's `signIn` rejection exposes `code`; treat `auth/popup-closed-by-user` and `auth/cancelled-popup-request` as no error.
- [ ] **Step 4: Run them and confirm they pass.** Expected: PASS.
- [ ] **Step 5: Commit** (`feat(web): sign-in page`). Update the progress file.

### Task 8: Remove the old screens

**Files:**
- Delete:
  - `apps/web/src/features/{home,onboarding,activity,accounts,reports,reminders,settings}/` (all files)
  - `features/shell/{AppNav,NavBar,NavIcon,nav-labels}.tsx|ts` and their tests and `nav.module.css`
  - `apps/web/src/app/{chat,activity,accounts,reports,reminders,settings,onboarding}/`
- Modify:
  - `apps/web/next.config.ts`: `redirects()` sends each of `/chat`, `/activity`, `/accounts`, `/accounts/new`, `/reports`, `/reminders`, `/settings` and `/onboarding` to `/` with `permanent: false`.
  - `shared/app-services.tsx`: drop `cash`, `reports` and `settings`.
  - `features/shell/AppShell.tsx`: no nav.
  - `shared/copy.ts`: drop `ACTIVITY_COPY`, `ACCOUNTS_COPY`, `ADD_ACCOUNT_COPY`, `REPORTS_COPY`, `SETTINGS_COPY`, `ONBOARDING_COPY` and `REMINDERS_COPY`, keeping any key the chat or dashboard still uses.
  - `shell.module.css`.
- Test: `apps/web/src/features/shell/AppShell.test.tsx`, `apps/web/next-config.test.ts` (create).

- [ ] **Step 1: Write the failing tests.**
  - `next config redirects every old route to /`: import the config and await `redirects()`; assert the eight sources, each with `destination: "/"`.
  - `AppShell renders the dashboard and the chat button with no navigation`: there is no `navigation` landmark and there is a button named /Open chat/.
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm --filter web exec vitest run next-config src/features/shell`. Expected: FAIL.
- [ ] **Step 3: Delete and modify as listed.** Then remove every orphaned import; `pnpm --filter web exec tsc --noEmit -p .` finds them.
- [ ] **Step 4: Run the checks.** Run: `pnpm verify`. Expected: PASS, with no dependency violations.
- [ ] **Step 5: Commit** (`refactor(web): remove the old screens`). Update the progress file.

### Task 9: End-to-end tests, final checks and records

**Files:**
- Modify: `e2e/fixture/navigation.spec.ts` (rename it to `dashboard.spec.ts`), `e2e/sms-to-posted.spec.ts`, `e2e/atm-follow-up.spec.ts`, `AGENT.md`, and the progress file.

- [ ] **Step 1: Rewrite the fixture smoke tests.**
  - `the dashboard shows the demo month`: Spent ৳18,640, the categories, and "৳1,740 more than this time last month".
  - `the chat opens, a demo send says nothing was saved, Escape closes it`.
  - `old routes land on the dashboard`: `/activity` and `/settings` end at `/`.
  - `the menu shows AI spend`.
- [ ] **Step 2: Update the emulator end-to-end tests.** They sign in, open the chat with the button, and paste the SMS as today. Then they close the chat and assert on the dashboard:
  - withdrawal SMS: Recent shows "Recorded", Cash not yet explained shows ৳4,000, and Spent is unchanged;
  - card purchase SMS: Spent rises by the purchase amount.
- [ ] **Step 3: Run everything.** Run: `pnpm verify && pnpm --filter web build && pnpm test:emulator && pnpm test:e2e && pnpm test:e2e:fixture`. Expected: all PASS. Paste the totals into the progress file.
- [ ] **Step 4: Update the records.** `AGENT.md`'s Project status says the web app is one dashboard plus a pop-up chat (CR-007), and the "Screens" section names the sign-in page, dashboard and chat. Write the progress file's open items: pieces 2–4, and the deferred minors still relevant.
- [ ] **Step 5: Commit** (`docs: record the dashboard and chat`). Then run the final whole-branch review.
