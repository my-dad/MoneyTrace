# UI-first Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every remaining MoneyTrace screen (navigation, Activity, Accounts & Cash, Reports, Settings/Onboarding, Reminders) in `apps/web`, driven by typed fixture data, before any further functionality.

**Architecture:** One `AppServices` React context supplies the read-model gateway, commands, auth gateway and the per-screen sources. A build-time flag (`NEXT_PUBLIC_DATA_SOURCE=fixture`) selects fixture implementations and shows a Demo data marker. Screens with no real backend get a `null` source in Firebase mode and render an honest "Not available yet" state. Each screen group is mocked up as static HTML, and the mockup needs Mabrur's approval before the group is built.

**Tech Stack:** Next.js 16 (app router), React 19, TypeScript strict, CSS modules, `@moneytrace/ui-kit`, Vitest + Testing Library + axe-core, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-ui-screens-design.md` (PRD CR-005)

## Global Constraints

- UI only. Do not modify `packages/domain`, `packages/application`, `packages/contracts`, `packages/infrastructure`, `apps/functions` or `firebase/`. `packages/ui-kit` may gain presentational components.
- No new dependencies.
- Money is integer minor units (poisha), BDT. Format with `formatBdt` from `@moneytrace/contracts` and render with `MoneyText`. No floats.
- Status labels are `Verified`, `Pending` and `Needs answer`. Only posted items say "Recorded". Unexplained cash is dashed and neutral, never red, and is never counted or worded as spending.
- Fixture actions never report success. They reject with `DemoUnavailableError`, and the UI shows `COPY.demoUnavailable` = `"Not available yet — demo · nothing was saved"`.
- The Demo data marker text is exactly `"Demo data"`, and it is visible on every screen in fixture mode.
- A screen whose source is `null` (Firebase mode, no backend yet) shows `COPY.notAvailableYet` = `"Not available yet"`. It never shows fake numbers.
- English only. All new copy goes in `apps/web/src/shared/copy.ts`.
- Accessibility: keyboard-reachable controls, touch targets ≥ 44 px, status as text and not only color, and no axe violations in any tested state.
- Every screen has loading, empty, error and populated states, each with a component test.
- Mockups live in `design/screens/<letter>-<name>.html`. They link `../../packages/ui-kit/src/tokens.css`, show phone (390 px) and desktop (1280 px) frames, and use one frame per state. **No group is built before its mockup is approved by Mabrur.**
- After every task: `pnpm verify` and `pnpm --filter web build` pass, and their totals are pasted into the progress file.
- **Last step of every task:** update `docs/superpowers/progress/ui-screens.md` (group table, next task, last verification output) and commit it with the task. Commits carry no Co-Authored-By or attribution lines.

## Review Focus

1. A fixture build pointed at a real Firebase project would skip sign-in against real data. The build must fail (Task 1, `fixture-guard.test.ts`).
2. Any demo action that resolves, or a screen that shows "Recorded" or "Saved" after a demo action. The UI must show `COPY.demoUnavailable` (Task 1 `fixture-commands.test.ts` and `ActionStatus.test.tsx`; each build task asserts it on one action).
3. Unexplained cash (`cash-unassigned`) shown as spending or in red. It must appear as "not yet explained" and stay out of expense totals (Task 8 `AccountsHome.test.tsx`, Task 10 `ReportsScreen.test.tsx`).
4. Credit-card balances shown with the raw signed value: a liability's `debitMinusCreditMinor` is negative, and the amount owed is its negation (Task 8 `AccountsHome.test.tsx`).
5. Firebase mode on a screen with no backend must show "Not available yet", never empty zeros that look like real data (Tasks 10 and 12, the `source={null}` tests).

---

### Task 1: App services and fixture mode

**Files:**
- Create: `apps/web/src/shared/data-source.ts`, `apps/web/src/shared/fixture-guard.ts`, `apps/web/src/shared/demo-unavailable.ts`, `apps/web/src/shared/fixture-commands.ts`, `apps/web/src/shared/app-services.tsx`, `apps/web/src/features/auth/fixture-auth-gateway.ts`, `apps/web/src/features/shell/DemoMarker.tsx`, `apps/web/src/features/shell/ActionStatus.tsx`
- Modify: `apps/web/next.config.ts`, `apps/web/src/shared/use-action.ts`, `apps/web/src/shared/copy.ts`, `apps/web/src/features/shell/AppShell.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/chat/page.tsx`, `apps/web/src/app/accounts/page.tsx`
- Test: `apps/web/src/shared/fixture-guard.test.ts`, `apps/web/src/shared/fixture-commands.test.ts`, `apps/web/src/shared/use-action.test.ts`, `apps/web/src/features/shell/ActionStatus.test.tsx`, `apps/web/src/features/shell/AppShell.test.tsx`

**Interfaces:**
- Produces:
  - `isFixtureMode(): boolean`: true iff `process.env.NEXT_PUBLIC_DATA_SOURCE === "fixture"`.
  - `assertFixtureModeAllowed(env: Record<string, string | undefined>): void`: throws `Error("Fixture mode requires a demo- Firebase project")` when `env.NEXT_PUBLIC_DATA_SOURCE === "fixture"` and `(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-moneytrace")` does not start with `"demo-"`.
  - `class DemoUnavailableError extends Error`
  - `createFixtureCommands(): Commands`: every method rejects with `DemoUnavailableError`.
  - `createFixtureAuthGateway(): AuthGateway`: `onChange` immediately emits `{ uid: "demo-user", displayName: "Demo" }`, and `bootstrap` resolves.
  - `type AppServices = { auth: AuthGateway; readModels: ReadModelGateway; commands: Commands; fixture: boolean }`. Tasks 8, 10 and 12 each add one field (`cash: CashSource | null`, `reports: ReportSource | null`, `settings: SettingsSource | null`), which is the fixture implementation in fixture mode and `null` otherwise.
  - `AppServicesProvider({ services, children })`, `useAppServices(): AppServices`, `createAppServices(): AppServices` (chooses Firebase or fixture by `isFixtureMode()`).
  - `useAction()` additionally returns `unavailable: boolean`: true when the action rejected with `DemoUnavailableError`, in which case `failed` is false.
  - `ActionStatus({ busy, failed, unavailable })` renders `role="status"` text: `COPY.demoUnavailable` when unavailable, `COPY.failed` when failed, and nothing otherwise.
  - `DemoMarker()` renders `"Demo data"` in a fixed, always-visible badge with `role="note"`.

- [ ] **Step 1: Write the failing tests**

`fixture-guard.test.ts`: `allows fixture mode on a demo- project` (`{NEXT_PUBLIC_DATA_SOURCE: "fixture", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-moneytrace"}` does not throw); `allows fixture mode with no project id`; `rejects fixture mode on a real project` (`"moneytrace-staging"` throws the exact message); `ignores the project when fixture mode is off`.

`fixture-commands.test.ts`: `every command rejects with DemoUnavailableError`. Iterate `Object.keys(createFixtureCommands())`, call each with `{}`, and expect `rejects.toBeInstanceOf(DemoUnavailableError)`. Assert that the key count equals the 12 commands in `commands.ts`.

`use-action.test.ts`: `marks a DemoUnavailableError as unavailable, not failed`; `marks any other error as failed`.

`ActionStatus.test.tsx`: renders `"Not available yet — demo · nothing was saved"` when unavailable; renders `COPY.failed` when failed; renders nothing when idle; never renders "Recorded" or "Saved".

`AppShell.test.tsx`: `shows the Demo data marker in fixture mode` (services with `fixture: true` → `getByRole("note")` has text `"Demo data"`); `shows no marker in Firebase mode`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm --filter web test -- fixture-guard fixture-commands use-action ActionStatus AppShell`
Expected: FAIL, with the modules not found.

- [ ] **Step 3: Implement**

- `next.config.ts` calls `assertFixtureModeAllowed(process.env)` at module load.
- `AppShell` becomes `AppShell({ children })`. It creates services once with `useMemo(createAppServices)`, then renders `AppServicesProvider` → `OfflineBanner` → `DemoMarker` (only if `services.fixture`) → `AuthGate gateway={services.auth}` → children. `AuthGate` is unchanged. Its tests keep passing because it still takes a gateway prop.
- Pages drop their own `AuthGate` and Firebase factories, and read `useAppServices()`. Behaviour in Firebase mode is unchanged.
- Add `COPY.demoUnavailable` and `COPY.notAvailableYet` with the exact strings from Global Constraints.

- [ ] **Step 4: Run the tests and confirm they pass, along with everything else**

Run: `pnpm --filter web test && pnpm verify && pnpm --filter web build`
Expected: PASS. Existing Home, Chat and Accounts tests still pass.

Then confirm the guard works: `NEXT_PUBLIC_DATA_SOURCE=fixture NEXT_PUBLIC_FIREBASE_PROJECT_ID=moneytrace-staging pnpm --filter web build`
Expected: FAIL with "Fixture mode requires a demo- Firebase project".

- [ ] **Step 5: Update the progress file and commit**

```bash
git add apps/web docs/superpowers/progress/ui-screens.md
git commit -m "feat(web): add app services and guarded fixture mode"
```

---

### Task 2: Fixture household dataset

**Files:**
- Create: `apps/web/src/shared/fixtures/household.ts`, `apps/web/src/shared/fixtures/fixture-read-models.ts`
- Modify: `apps/web/src/shared/app-services.tsx` (the fixture branch uses `createFixtureReadModels()`)
- Test: `apps/web/src/shared/fixtures/household.test.ts`

**Interfaces:**
- Consumes: `InMemoryReadModelGateway`, the row types from `read-model-gateway.ts`.
- Produces: `FIXTURE_NOW_MS = Date.parse("2026-11-06T20:00:00+06:00")`; `FIXTURE_ACCOUNTS: AccountRow[]`, `FIXTURE_BALANCES: BalanceRow[]`, `FIXTURE_FOLLOW_UPS: FollowUpRow[]`, `FIXTURE_SOURCE_EVENTS: SourceEventRow[]`, `FIXTURE_EXPENSE_ENTRIES: ExpenseEntryRow[]`; `createFixtureReadModels(): InMemoryReadModelGateway` (seeded). Later tasks reference accounts by these ids.

The figures match `design/MoneyTrace.html` screen 01, as integer poisha:

| id | kind | name | balance (taka) |
|---|---|---|---|
| `bank-dbbl` | bank | DBBL Savings | 82,000 |
| `bank-city` | bank | City Bank Current | 31,500 |
| `bank-bkash` | bank | bKash | 12,000 |
| `cash-wallet` | cash | Wallet | 7,200 |
| `cash-home` | cash | Home | 8,000 |
| `family-ammu` | familyCash | Ammu | 4,500 |
| `cash-unassigned` | cash | Cash · place not set | 5,000 (yesterday's ATM withdrawal) |
| `card-amex` | creditLiability | City Bank Amex ••7702 | owes 18,450 (raw `-1845000`) |
| `card-ebl` | creditLiability | EBL Visa ••2290 | owes 6,120 (raw `-612000`) |

Expense entries for 1–6 Nov total 18,640: groceries 6,820, transport 3,150, eating-out 2,940, other 5,730. There are 4 or more entries per category, so the lists have depth. The source events cover every status the Activity filters need: at least 6 `posted`, 2 `pending` with `awaitingClarification`, 1 `linkedAsDuplicate`, 1 `rejected` and 1 `deadLetter`, using `sms` and `chat` sources. Follow-ups: 1 open `withdrawalDestination` for the 5,000 withdrawal, 1 open `unreviewedCashActivity`, and 1 `snoozed`.

- [ ] **Step 1: Write the failing tests**

`household.test.ts`:
- `every fixture row satisfies its contract schema`: parse each array with `OWNER_COLLECTIONS.<collection>`.
- `bank balances total 1,25,500 taka`: the sum for `kind === "bank"` equals `12_550_000`.
- `cash balances total 24,700 taka, including 5,000 not yet explained`: the sum for cash and familyCash equals `2_470_000`, and `cash-unassigned` is `500_000`.
- `card amounts owed total 24,570 taka`: the negated liability sum equals `2_457_000`.
- `November expenses total 18,640 taka`.
- `the seeded gateway delivers every collection`.

- [ ] **Step 2: Run and confirm they fail**

Run: `pnpm --filter web test -- household`
Expected: FAIL, with the module not found.

- [ ] **Step 3: Write the dataset and `createFixtureReadModels()`**

- [ ] **Step 4: Run, confirm they pass, and run the full check**

Run: `pnpm --filter web test && pnpm verify && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 5: Update the progress file and commit**

```bash
git commit -m "feat(web): add fixture household dataset"
```

---

### Task 3: Mockup A — navigation shell

**Files:**
- Create: `design/screens/A-navigation.html`

Frames, each on phone and desktop:
1. The Home screen inside the shell: bottom tab bar (phone) or side rail (desktop) with Home, Chat, Activity, Accounts and Reports, Home active. The Home header has a Settings icon button and a reminders bell with a count badge of 2.
2. The Chat tab active.
3. Fixture mode: the Demo data marker placed so it never covers content or the tab bar.
4. Keyboard focus visible on a tab.

Each tab has an icon and a text label. The active tab is shown by a text-weight change plus an indicator, not by color alone. Tab targets are ≥ 44 px.

- [ ] **Step 1: Draw the mockup**, reusing the existing Home look from `design/MoneyTrace.html` screen 01.
- [ ] **Step 2: Render screenshots and check them.** Use a scratchpad Playwright script with `playwright-core` from `node_modules/.pnpm/playwright-core@1.51.1` to capture each frame at 390 px and 1280 px. Check for text overflow and overlap.
- [ ] **Step 3: Update the progress file (Mockup A: drawn, awaiting approval) and commit**

```bash
git commit -m "design: add navigation shell mockup"
```

- [ ] **Step 4: STOP.** Send Mabrur the path. Revise and recommit until they approve. Record the approval in the progress file.

---

### Task 4: Build A — navigation shell

**Files:**
- Create: `apps/web/src/features/shell/NavBar.tsx`, `apps/web/src/features/shell/nav.module.css`, `apps/web/src/features/shell/NotAvailableYet.tsx`, placeholder routes `apps/web/src/app/{activity,reports,settings,reminders}/page.tsx`, `e2e/fixture/playwright.config.ts`, `e2e/fixture/navigation.spec.ts`
- Modify: `apps/web/src/features/shell/AppShell.tsx` (renders `NavBar`), `apps/web/src/features/home/HomeScreen.tsx` (header icons), `apps/web/src/shared/copy.ts`, root `package.json` (script `test:e2e:fixture`), `e2e/tsconfig.json` if needed
- Test: `apps/web/src/features/shell/NavBar.test.tsx`, additions to `apps/web/src/features/home/HomeScreen.test.tsx`

**Interfaces:**
- Produces:
  - `NAV_ITEMS = [{ href: "/", label: "Home" }, { href: "/chat", label: "Chat" }, { href: "/activity", label: "Activity" }, { href: "/accounts", label: "Accounts" }, { href: "/reports", label: "Reports" }] as const`
  - `NavBar({ pathname }: { pathname: string })`: a `<nav aria-label="Main">`. The active link has `aria-current="page"`. `/accounts/...` matches Accounts.
  - `NotAvailableYet()` renders `COPY.notAvailableYet`. Later tasks replace the placeholder routes.
  - `HomeScreen` gains a Settings link (`aria-label="Settings"`, `/settings`) and a reminders link (`aria-label` = `"Reminders, N open"`, `/reminders`). N counts follow-ups in state `open`.

- [ ] **Step 1: Write the failing tests.** `NavBar.test.tsx`: `renders the five tabs in order`, `marks the current tab with aria-current`, `matches nested accounts paths`, `has no axe violations`. HomeScreen: `links to settings` and `shows the open reminder count` (2 open and 1 snoozed gives `"Reminders, 2 open"`).
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm --filter web test -- NavBar HomeScreen`
- [ ] **Step 3: Implement to the approved mockup.** `AppShell` reads the path with `usePathname()`.
- [ ] **Step 4: Add the fixture smoke test.** The root script is `"test:e2e:fixture": "NEXT_PUBLIC_DATA_SOURCE=fixture pnpm --filter web build && playwright test --config=e2e/fixture/playwright.config.ts"`. The config is the same as `e2e/playwright.config.ts`, but with `testDir: "."` under `e2e/fixture` and the device `devices["Pixel 7"]`. The existing `e2e/playwright.config.ts` adds `testIgnore: "fixture/**"`. `navigation.spec.ts`: `every tab and header entry opens, with the Demo data marker visible`. It visits `/`, clicks each tab and the Settings and Reminders links, and asserts the URL and the `"Demo data"` marker each time.
- [ ] **Step 5: Run.** `pnpm --filter web test && pnpm verify && pnpm --filter web build && pnpm test:e2e:fixture`. Expected: PASS.
- [ ] **Step 6: Update the progress file and commit.** Message: `feat(web): add navigation shell and fixture smoke test`.

---

### Task 5: Mockup B — Activity / Inbox

**Files:** Create `design/screens/B-activity.html`

Frames: the list, populated and grouped by day, with filter chips All, Posted, Pending, Needs answer and Duplicates; one filter applied; empty (no activity yet); empty for a filter; loading; read error; transaction detail for a posted card purchase (amount, accounts, date, the source SMS as `retainedText`, status, parser/AI provenance); detail for a duplicate ("Already recorded · not counted twice", linking to the original); detail for a pending item (the question, plus Answer in chat); the Correct / Reverse sheet (reason field, and the warning that the original stays in history); the sheet after submitting in demo (`COPY.demoUnavailable`).

Steps are the same as Task 3: draw, render and check, update progress and commit (`design: add activity mockup`), then **STOP for approval**.

---

### Task 6: Build B — Activity / Inbox

**Files:**
- Create: `apps/web/src/features/activity/activity-view-model.ts`, `ActivityScreen.tsx`, `ActivityDetail.tsx`, `CorrectionSheet.tsx`, `activity.module.css`
- Modify: `apps/web/src/app/activity/page.tsx`, `apps/web/src/shared/copy.ts`
- Test: `activity-view-model.test.ts`, `ActivityScreen.test.tsx`, `ActivityDetail.test.tsx`, `CorrectionSheet.test.tsx`

**Interfaces:**
- Consumes: `ReadModelGateway.watchSourceEvents`, `watchAccounts`; `Commands.correctTransaction`; `useAction`, `ActionStatus`.
- Produces:
  - `type ActivityFilter = "all" | "posted" | "pending" | "needsAnswer" | "duplicates"`
  - `toActivityItems(events: SourceEventRow[], accounts: AccountRow[]): ActivityItem[]`, newest first by `candidate?.occurredAtMs ?? receivedAtMs`.
  - `filterActivity(items: ActivityItem[], filter: ActivityFilter): ActivityItem[]`
  - `type ActivityItem = { id: string; title: string; amountMinor: number | null; direction: "in" | "out" | "move"; accountName: string | null; occurredAtMs: number; status: "Verified" | "Pending" | "Needs answer"; statusText: string; duplicate: boolean }`

  Status mapping: `posted` → Verified, with `COPY.recorded`. `pending` with `awaitingClarification` → Needs answer. Other `pending` statuses and in-flight stages → Pending. `linkedAsDuplicate` → `COPY.linkedAsDuplicate` with `duplicate: true`. `rejected` / `cancelled` / `deadLetter` → their existing COPY strings. Withdrawals have `direction: "move"` and are never shown as spending.
  - `ActivityScreen({ gateway, commands })`: the selected item uses the `?id=` search param, read inside `Suspense`.

- [ ] **Step 1: Write the failing tests.** View model: `maps each source status to the right label`, `filters needs-answer to awaitingClarification only`, `shows a withdrawal as a move, not spending`, `sorts newest first`. Screen: `shows loading, then items` (the in-memory gateway), `shows the empty state`, `shows the read error` (`gateway.fail("sourceEvents")`), `filters by chip`, `has no axe violations`. Detail: `shows the source SMS text and provenance`, `links a duplicate to its original`. Sheet: `requires a reason`, `shows the demo-unavailable status after submitting with fixture commands and never says Recorded`.
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm --filter web test -- activity Activity CorrectionSheet`
- [ ] **Step 3: Implement to the approved mockup.**
- [ ] **Step 4: Run** `pnpm --filter web test && pnpm verify && pnpm --filter web build && pnpm test:e2e:fixture` and confirm it passes. Extend `navigation.spec.ts`: `opening an activity item shows its detail`.
- [ ] **Step 5: Update the progress file and commit.** Message: `feat(web): add activity screen`.

---

### Task 7: Mockup C — Accounts & Cash

**Files:** Create `design/screens/C-accounts.html`

Frames: the accounts home, grouped Bank / Cash / Family-held cash / Credit cards with group totals, the unexplained 5,000 shown dashed and neutral, and an Add account action; empty (new user, leading to setup); loading; error; account detail for a bank account (balance, linked instruments such as a debit card ••4821 and bKash, recent history); account detail for a credit card (owed, due date, purchases and repayments, and "Repayment is not an expense"); cash count (enter the counted amount, see the difference against the expected amount, then the next step); the adjustment form (amount, required cause, note, the warning that it is not spending); cash allocation (give cash to a family member: from, to, amount, "This moves cash, it isn't spending"); a submitted demo action showing `COPY.demoUnavailable`. The existing account setup form moves to `/accounts/new` and keeps its current look.

Same steps as Task 3. Commit message: `design: add accounts and cash mockup`. **STOP for approval.**

---

### Task 8: Build C — Accounts & Cash

**Files:**
- Create: `apps/web/src/features/accounts/cash-source.ts`, `fixture-cash-source.ts`, `accounts-view-model.ts`, `AccountsHome.tsx`, `AccountDetail.tsx`, `CashCountFlow.tsx`, `AdjustmentForm.tsx`, `AllocationForm.tsx`, `apps/web/src/app/accounts/new/page.tsx`
- Modify: `apps/web/src/app/accounts/page.tsx` (renders `AccountsHome`; the existing `AccountsScreen` moves to `/accounts/new`), `HomeScreen.tsx` (Add account links to `/accounts/new`), `apps/web/src/shared/app-services.tsx` (`cash: CashSource | null`: the fixture in fixture mode, `null` otherwise), `copy.ts`
- Test: `accounts-view-model.test.ts`, `AccountsHome.test.tsx`, `AccountDetail.test.tsx`, `CashCountFlow.test.tsx`, `AdjustmentForm.test.tsx`, `AllocationForm.test.tsx`, `fixture-cash-source.test.ts`

**Interfaces:**
- Consumes: `watchAccounts`, `watchBalances`; the `FIXTURE_*` ids.
- Produces:
  ```ts
  type InstrumentView = { id: string; kind: "debitCard" | "creditCard" | "mobileWallet" | "bankAccount"; label: string; masked: string };
  type HistoryItem = { id: string; occurredAtMs: number; title: string; amountMinor: number; direction: "in" | "out" | "move"; status: "Verified" | "Pending" | "Needs answer" };
  type CardDue = { dueDate: string /* YYYY-MM-DD */; statementOwedMinor: number };
  type CashSource = {
    instruments(accountId: string): Promise<InstrumentView[]>;
    history(accountId: string): Promise<HistoryItem[]>;
    cardDue(accountId: string): Promise<CardDue | null>;
    recordCashCount(input: { accountId: string; countedMinor: number }): Promise<void>;
    recordAdjustment(input: { accountId: string; amountMinor: number; cause: string; note: string }): Promise<void>;
    allocateCash(input: { fromAccountId: string; toAccountId: string; amountMinor: number }): Promise<void>;
  };
  ```
  The fixture reads return data built from the household dataset. The three writes always reject with `DemoUnavailableError`.
  - `groupAccounts(accounts: AccountRow[], balances: BalanceRow[]): AccountGroup[]`, where `AccountGroup = { kind: AccountRow["kind"]; title: string; totalMinor: number; rows: { id: string; name: string; amountMinor: number; unexplained: boolean }[] }`. For `creditLiability`, `amountMinor` is the amount owed (the negated raw value). `unexplained` is true only for `cash-unassigned`.
  - `cashDifference(expectedMinor: number, countedMinor: number): number` returns counted minus expected. The amount is entered with `parseBdtInput`.

- [ ] **Step 1: Write the failing tests.** View model: `groups accounts in the order bank, cash, family-held, cards`, `shows card amounts owed as positive`, `marks only cash-unassigned as unexplained`, `computes the cash count difference`. `AccountsHome`: `shows the 5,000 as not yet explained with no danger styling` (assert the text and that no element has the danger class), `shows totals that match the fixture`, plus the loading, empty, error and axe tests. `AccountDetail`: `lists linked instruments`, `shows card due and states repayment is not an expense`, `shows Not available yet when cash source is null`. Forms: `adjustment requires a cause`, `rejects non-numeric amounts`, and for each form, `submitting with the fixture source shows the demo-unavailable status`.
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm --filter web test -- accounts Account CashCount Adjustment Allocation cash-source`
- [ ] **Step 3: Implement to the approved mockup.** The existing `AccountsScreen.test.tsx` keeps passing unchanged.
- [ ] **Step 4: Run** `pnpm --filter web test && pnpm verify && pnpm --filter web build && pnpm test:e2e:fixture` and confirm it passes. Extend the smoke test: `opening an account shows its detail`.
- [ ] **Step 5: Update the progress file and commit.** Message: `feat(web): add accounts and cash screens`.

---

### Task 9: Mockup D — Reports

**Files:** Create `design/screens/D-reports.html`

Frames: calendar month (Nov 2026) with income, expenses, the category breakdown, the trend against the previous period, account movements, outstanding cards and discrepancies; the salary-cycle toggle (25 Oct – 24 Nov); a previous period; an empty period; loading; error; unexplained cash shown as its own neutral line and not inside expenses; "Not available yet" (Firebase mode).

Same steps as Task 3. Commit message: `design: add reports mockup`. **STOP for approval.**

---

### Task 10: Build D — Reports

**Files:**
- Create: `apps/web/src/features/reports/report-source.ts`, `fixture-report-source.ts`, `ReportsScreen.tsx`, `reports.module.css`
- Modify: `apps/web/src/app/reports/page.tsx`, `app-services.tsx` (`reports`), `copy.ts`
- Test: `fixture-report-source.test.ts`, `ReportsScreen.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  type PeriodKind = "calendarMonth" | "salaryCycle";
  type PeriodReport = {
    label: string;                        // "November 2026" or "25 Oct – 24 Nov"
    incomeMinor: number; expenseMinor: number; unexplainedCashMinor: number;
    categories: { category: string; amountMinor: number; previousMinor: number }[];
    movements: { accountId: string; name: string; inMinor: number; outMinor: number }[];
    cards: { accountId: string; name: string; owedMinor: number; dueDate: string }[];
    discrepancies: { id: string; accountName: string; differenceMinor: number; reviewed: boolean }[];
  };
  type ReportSource = { load(kind: PeriodKind, offset: number): Promise<PeriodReport | null> }; // offset 0 = current, -1 = previous; null = no data
  ```
  Fixture: offsets 0 and -1 have data for both kinds. The current calendar month's expenses equal 18,640 taka, and `unexplainedCashMinor` is `500_000`. Offsets of -2 or earlier return `null`.
  - `ReportsScreen({ source }: { source: ReportSource | null })`

- [ ] **Step 1: Write the failing tests.** Source: `the current month's expenses match the household fixture`, `unexplained cash is not included in expenses`, `older periods return null`. Screen: `switches between month and salary cycle`, `steps to the previous period`, `shows the empty state for a null period`, `shows the error state when load rejects`, `shows unexplained cash on its own neutral line`, `shows Not available yet when source is null`, `has no axe violations`.
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm --filter web test -- report Report`
- [ ] **Step 3: Implement to the approved mockup.** Category bars are plain CSS widths, computed with integer math as `Math.round((amount * 100) / max)` percent. No chart library.
- [ ] **Step 4: Run the full checks and the fixture smoke test.** Expected: PASS.
- [ ] **Step 5: Update the progress file and commit.** Message: `feat(web): add reports screen`.

---

### Task 11: Mockup E — Settings / Onboarding

**Files:** Create `design/screens/E-settings.html`

Frames: an onboarding wizard of 5 steps with a progress indicator (1 Welcome and name, 2 Currency BDT plus reporting period month or salary cycle with a start day, 3 Accounts, reusing the setup form, 4 Opening balances, which are "positions, not income", 5 Reminders frequency and digest time); the settings home (Reporting period, AI budget, Reminders, Notifications, Privacy, Sign out); the AI budget view (today's and this month's spend against the limits of USD 0.05 per day and 5.00 per month, read-only, with "Chat and parsing keep working when the budget runs out"); the reminders form (daily, weekly or off, digest time, quiet hours, minimum amount); notifications (an explanation of push permission, with the in-app inbox always on); privacy (what is stored, and that no passwords, PINs or OTPs are ever asked for); a saved demo action showing `COPY.demoUnavailable`.

Same steps as Task 3. Commit message: `design: add settings and onboarding mockup`. **STOP for approval.**

---

### Task 12: Build E — Settings / Onboarding

**Files:**
- Create: `apps/web/src/features/settings/settings-source.ts`, `fixture-settings-source.ts`, `SettingsScreen.tsx`, `AiBudgetView.tsx`, `ReminderSettingsForm.tsx`, `NotificationSettings.tsx`, `PrivacyView.tsx`, `apps/web/src/features/onboarding/OnboardingWizard.tsx`, `onboarding.module.css`, `apps/web/src/app/onboarding/page.tsx`
- Modify: `apps/web/src/app/settings/page.tsx`, `app-services.tsx` (`settings`), `HomeScreen.tsx` (the new-user empty state links to `/onboarding`), `copy.ts`
- Test: `fixture-settings-source.test.ts`, `SettingsScreen.test.tsx`, `AiBudgetView.test.tsx`, `ReminderSettingsForm.test.tsx`, `OnboardingWizard.test.tsx`

**Interfaces:**
- Consumes: `Commands.updateSettings`, `createAccount`, `recordOpeningBalance` (the onboarding steps reuse the existing `AccountsScreen` form for step 3).
- Produces:
  ```ts
  type SettingsView = {
    displayName: string;
    reportingCycle: { kind: "calendarMonth" } | { kind: "salaryCycle"; startDay: number }; // 1–28
    notifications: { frequency: "daily" | "weekly" | "off"; digestLocalTime: string; minThresholdMinor: number; quietHours?: { startLocalTime: string; endLocalTime: string } };
    ai: { spentTodayUsdMicros: number; dailyLimitUsdMicros: number; spentMonthUsdMicros: number; monthlyLimitUsdMicros: number };
  };
  type SettingsSource = { load(): Promise<SettingsView> };
  ```
  Fixture: salary cycle, start day 25; daily digest at 21:00; limits `50_000` and `5_000_000` µUSD; spent `12_000` today and `1_430_000` this month. Saves go through `Commands.updateSettings`, which rejects in fixture mode.
  - `OnboardingWizard({ commands })`: the steps are local state. Back and Next keep entered values. A salary-cycle start day outside 1–28 blocks Next with an inline error.

- [ ] **Step 1: Write the failing tests.** Source: `matches the settings schema shape` (parse its profile-like part with `userProfileSchema.shape.reportingCycle` and `.shape.notifications`). Settings: `shows each section`, `shows Not available yet when source is null`, plus the loading, error and axe tests. AI budget: `formats micro-dollars as USD cents, rounded down, using integer math` (`12_000` gives `"$0.01"`, `1_430_000` gives `"$1.43"`, `50_000` gives `"$0.05"`), `says chat keeps working when the budget is reached`. Reminders form: `saving with fixture commands shows the demo-unavailable status`. Wizard: `walks all five steps`, `keeps values when going back`, `blocks start day 29`, `states opening balances are not income`, `has no axe violations`.
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm --filter web test -- settings Settings AiBudget ReminderSettings Onboarding`
- [ ] **Step 3: Implement to the approved mockup.**
- [ ] **Step 4: Run the full checks and the fixture smoke test.** Extend the smoke test: `onboarding opens from the new-user Home`. Expected: PASS.
- [ ] **Step 5: Update the progress file and commit.** Message: `feat(web): add settings and onboarding screens`.

---

### Task 13: Mockup F — Reminders inbox

**Files:** Create `design/screens/F-reminders.html`

Frames: the open list (the withdrawal-destination question for 5,000, worded as "Where did the 5,000 go?" and never as "you spent"; the unreviewed cash activity); snoozed items in their own section; answering one (opens Chat with the question); the snooze picker (1 hour, tonight, tomorrow); done or dismissed; empty ("Nothing to answer"); loading; error; the demo action status.

Same steps as Task 3. Commit message: `design: add reminders mockup`. **STOP for approval.**

---

### Task 14: Build F — Reminders inbox

**Files:**
- Create: `apps/web/src/features/reminders/reminders-view-model.ts`, `RemindersScreen.tsx`, `reminders.module.css`
- Modify: `apps/web/src/app/reminders/page.tsx`, `copy.ts`
- Test: `reminders-view-model.test.ts`, `RemindersScreen.test.tsx`

**Interfaces:**
- Consumes: `watchFollowUps`; `Commands.resolveFollowUp`, `snoozeFollowUp`.
- Produces: `splitReminders(rows: FollowUpRow[], nowMs: number): { open: FollowUpRow[]; snoozed: FollowUpRow[] }`. Open items are sorted by `dueAtMs`. Resolved and dismissed rows are excluded. A snoozed row whose `snoozedUntilMs <= nowMs` counts as open.

- [ ] **Step 1: Write the failing tests.** View model: `separates open and snoozed`, `treats an expired snooze as open`, `drops resolved and dismissed`. Screen: `shows the open and snoozed sections`, `never uses the word "spent" for withdrawal destination`, `Answer opens chat`, `snoozing with fixture commands shows the demo-unavailable status`, plus the empty, loading, error and axe tests.
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm --filter web test -- reminders Reminders`
- [ ] **Step 3: Implement to the approved mockup.**
- [ ] **Step 4: Run the full checks and the fixture smoke test.** Expected: PASS.
- [ ] **Step 5: Update the progress file and commit.** Message: `feat(web): add reminders inbox`.

---

### Task 15: UI-complete exit

**Files:**
- Modify: `AGENT.md` (project status: UI complete in fixture mode; add `pnpm test:e2e:fixture` to Commands), `docs/superpowers/progress/ui-screens.md`

- [ ] **Step 1: Run everything**

Run: `pnpm verify && pnpm --filter web build && pnpm test:emulator && pnpm test:e2e && pnpm test:e2e:fixture`
Expected: PASS. Paste the totals into the progress file.

- [ ] **Step 2: Walk every screen in fixture mode at 390 px and 1280 px.** Capture screenshots to the scratchpad, and compare each one against its approved mockup. Note any differences in the progress file.

- [ ] **Step 3: Write the open items in the progress file for the functionality phase.** These are the CR-003 reviews; real sources for `CashSource`, `ReportSource` and `SettingsSource`, plus the read-model fields they need; the Phase 1 merge; and DeepSeek pricing and terms.

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: record UI-complete state"
```
