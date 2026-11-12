# Dashboard and pop-up chat (piece 1 of 4): design

Date: 2026-11-12. Status: written for Mabrur's review.
Change request: PRD CR-007. Branch: `dashboard-chat`, from `phase-1-sms-slice`.

## 1. Intent

Mabrur's description of the product, agreed on 2026-11-12:

- A user signs in with Google and lands on a dashboard. A new user's dashboard is blank; a returning user sees their data.
- A button pops up a chat. The user pastes any transaction SMS (credit, debit, ATM withdrawal) or describes any spending. DeepSeek extracts the data, the dashboard shows it, and the app does the calculations.
- The dashboard shows where the money went as a graph, and tips to spend less.

Mabrur's choices: accounts are created automatically from SMS; the app is one dashboard plus the pop-up chat; tips come from DeepSeek using totals only; when something is unclear the chat asks one short question.

Assumptions Mabrur confirmed:

1. The ledger stays behind the dashboard, so a withdrawal is never spending and a card repayment is never counted twice. The user never sees accounts or the ledger, only results.
2. An account created from an SMS keeps the last 3–4 digits the SMS shows, so two cards at one bank stay apart. The user never types them.
3. Known bank SMS formats are read by fixed rules first; DeepSeek reads everything else.
4. The chat's questions replace the reminders inbox.
5. Sign-out and the AI budget move into a small menu on the dashboard; the Settings screen goes.

The work is split into four pieces, each with its own spec and plan:

| # | Piece | This spec? |
|---|---|---|
| 1 | Dashboard and pop-up chat | Yes |
| 2 | Accounts created from SMS | No |
| 3 | Tips from DeepSeek, using totals only | No (the dashboard reserves a spot) |
| 4 | Going live with DeepSeek: the 0B gate, the data-terms check, and the key stored as a secret by Mabrur | No |

Real SMS can't be processed by DeepSeek until piece 4 (PRD CR-002). Until then the app runs locally with the fake AI.

## 2. Scope of piece 1

In scope: the web app only. The sign-in page, one dashboard built from real read models, the chat moved into a pop-up, removal of every other screen, demo data updated to match, and tests.

Out of scope: any backend, contract or rules change (one Firestore index may be added for the AI usage read); accounts from SMS (piece 2); tips (piece 3); deployment (piece 4).

## 3. What the user sees

### Sign-in page

The app name, one line about what it does, and "Sign in with Google". Nothing else. The page uses the review's accessibility fixes: a `main` landmark, an `h1`, `role="status"` on progress text, and the ui-kit `Button`.

### Dashboard (the only screen after sign-in)

- **Top bar:** the user's name and a menu button. The menu shows the AI budget used this month (for example "$1.43 of $5.00") and Sign out.
- **This month:** three figures:
  - *Spent*
  - *Came in*
  - *Cash not yet explained*. Shown only when above ৳0, in a neutral dashed box, never counted as spending.

  A ‹ › control steps back through earlier calendar months. › is disabled on the current month.
- **Where it went:** a bar chart of spending by category, largest first, with a comparison line such as "৳1,740 more than last month" (or "less", or "same as last month"; no line when there is no earlier month).
- **Money now:** bank and cash balances together, and card amounts owed as positive numbers.
- **Recent:** the last 10 messages sent, each with a status read from the server: *Recorded*, *Waiting for your answer*, or *Couldn't read*.
- **Tips:** an empty region reserved for piece 3. Nothing is rendered there in piece 1.
- **New user** (no recorded transactions): all the sections above are replaced by one message, "Paste a bank SMS or tell me about a purchase to get started", pointing at the chat button.

### Chat button and panel

- A round button fixed to the bottom-right at every screen size.
- On a phone it opens the chat full-screen. On a computer (≥1024 px) it slides in as a right-hand panel and the dashboard stays visible.
- It shows a badge with the number of open questions.
- The panel is a modal dialog: focus moves in when it opens, Tab stays inside, Escape closes it, and focus returns to the button (the shared `useModalFocus`).
- The dashboard updates live while the panel is open.

### Removed

- The bottom tab bar and side menu.
- The setup wizard, Activity, Accounts (including Add account), Reports, Reminders and Settings.

The old routes (`/chat`, `/activity`, `/accounts`, `/accounts/new`, `/reports`, `/settings`, `/onboarding`, `/reminders`) redirect to `/`.

## 4. Where the numbers come from

All figures come from existing read models; nothing new is stored.

| Figure | Source | Rule |
|---|---|---|
| Spent | `ledgerEntries` with `accountKind == "expense"` in the month | Debits minus credits, so a refund lowers it. Withdrawals, card repayments and transfers never touch expense accounts, so they're excluded by construction. |
| Came in | `ledgerEntries` with `accountKind == "income"` in the month | Credits minus debits. This is the one new web read; it uses the same query shape and the existing `accountKind` + `occurredAtMs` index. |
| Cash not yet explained | Balance of the system wallet `cash-unassigned` | Shown only when above 0, never added to Spent. |
| Money now | `balances` | Bank + cash + family cash; card owed = the negated `creditLiability` balance, shown when above 0. |
| Where it went | The month's expense entries, grouped by category | The category is the expense account id without its `expense-` prefix. The previous month uses the same rule. |
| Recent | `sourceEvents`, newest first, limit 10 | Status from the event, mapped as the current chat and activity view models do. *Recorded* only for `posted`. |
| Open questions | `followUps` with state `open`, or `snoozed` with `snoozedUntilMs` in the past | Drives the button badge. |

Months are calendar months in Asia/Dhaka (fixed UTC+6). The salary-cycle option is dropped. All money is integer poisha formatted with `formatBdt`; the chart's bar widths use integer percentages.

## 5. Chat

The Phase 1 `ChatScreen` moves into the panel unchanged in behaviour. It keeps:

- its honest status lines;
- the demo wording (`COPY.demoUnavailable`);
- its question cards with answer buttons;
- the "AI budget reached" waiting state.

Only its page chrome changes: it no longer renders its own `main` landmark or app header inside the panel.

## 6. Errors and edge states

- **Read failure:** a bar says "Couldn't load your latest figures. Anything shown may be out of date." Figures already loaded stay.
- **Loading:** "Loading…" is shown in place of each figure until its first snapshot arrives. Loading never shows ৳0.
- **Offline:** the existing offline banner shows, and the chat's Send is disabled.
- **AI budget reached:** handled by the existing pipeline and shown in the chat.
- **A month with nothing recorded:** shows "Nothing recorded in October 2026", and ‹ › still work.

## 7. Code changes

- New `apps/web/src/features/dashboard/`:
  - `dashboard-view-model.ts` (pure)
  - `DashboardScreen.tsx`
  - `MonthSwitch`, `CategoryChart`, `RecentList` and `AccountMenu`
  - styles and tests

  It replaces `features/home`. `home-view-model`'s calculations move here and are extended.
- New `apps/web/src/features/chat/ChatLauncher.tsx`: the button, the badge and the panel.
- `ReadModelGateway` gains `watchIncomeEntries(fromMs, toMs, …)` and `watchAiUsage(fromMs, toMs, …)` in the Firebase and in-memory gateways, with tests. If `aiUsage` needs an index for the date range, the plan adds it; that is the only possible `firebase/` change.
- `AppShell` renders the dashboard and the launcher; the nav, `AppNav` and `NavBar` are removed.
- Deleted with their tests:
  - `features/onboarding`, `activity`, `accounts`, `reports`, `reminders`, `settings`
  - the fixture sources only they used (`cash-source`, `report-source`, `settings-source`)
  - their `app/*` pages, which become redirects

  Pieces still used elsewhere (`ActionStatus`, `useModalFocus`, `DemoMarker`, `OfflineBanner`, `NotAvailableYet`) stay.
- Fixture mode stays. The demo household gets:
  - a month of spending and income;
  - one unexplained ATM withdrawal;
  - one open question;
  - account names with no card digits (this closes the CR-006 open item).

  Demo actions still answer "Not available yet — demo · nothing was saved".
- `AppServices` loses `cash`, `reports` and `settings`. The AI budget figure in the menu sums this month's `aiUsage` rows, which the owner can read under the rules, against the default monthly limit ($5). This adds a second new web read, `watchAiUsage(fromMs, toMs, …)`.
- No change to `packages/*`, `apps/functions`, rules or contracts.

## 8. Delivery

1. HTML mockup of the dashboard and chat (phone and desktop, every state above), for Mabrur's approval. Nothing is built before approval.
2. Dashboard view model and screen.
3. Chat launcher and panel.
4. Removal of the old screens, routes and fixture sources.
5. Final checks and a fresh whole-branch review.

`docs/superpowers/progress/dashboard-chat.md` is updated and committed after every task.

## 9. Testing

- **View model:** each figure (Spent, Came in, unexplained cash, Money now, categories, comparison line), month boundaries in Dhaka time, refunds, and loading versus empty.
- **Components:** the month switch, the chart, the recent statuses, the new-user state, the read-failure bar, the menu, and the launcher (open, close, Escape, focus return, badge count). There is an axe check on each.
- **Fixture smoke test:** dashboard figures, opening the chat, sending a message (demo status), and old routes redirecting.
- **Emulator end-to-end:** sign in, paste the withdrawal SMS, and see it in Recent as Recorded, with the unexplained-cash figure shown and Spent unchanged; paste a card purchase and see Spent rise.
- **Commands that must pass:** `pnpm verify`, `pnpm --filter web build`, `pnpm test:emulator`, `pnpm test:e2e` and `pnpm test:e2e:fixture`.

## 10. Risks

- **Removing screens removes features:** cash counts, custody as an action, corrections from a list, salary cycles and push settings. Mabrur accepted this; the backend keeps the commands.
- **No mockup approved yet:** the layout may change at the mockup step; this spec fixes content and behaviour, not pixels.
- **AI budget figure:** it sums recorded usage rows, so a call whose outcome is unknown counts at its reserved estimate, the same as the quota does.
