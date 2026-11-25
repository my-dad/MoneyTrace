# Income and spending clarity — design

Date: 2026-11-25. Approved in conversation by Mabrur.

## Intent

Mabrur built MoneyTrace for one reason: to know what came in, what went out, and **where** it
went. Two gaps defeat that today:

- Cash he reports spending never draws down the cash he withdrew, so "Cash not yet explained"
  never falls.
- Bank SMS name the merchant, but spending is not sorted by it, so most of it lands in
  "Not sorted yet".

He also wants to record cash income that never touches a bank (house rent, for example), and a
dashboard that opens on charts showing which sector takes the most money and that update live.

## Goals

1. **Cash pocket.** A cash spend reported in chat comes out of the withdrawn cash first, so the
   unexplained amount falls. The pocket never goes below zero; any excess comes from cash in hand.
2. **Where and which sector.** Every spend carries the merchant named in its SMS (or note), and a
   sector from either a fixed list of well-known merchants or the user's own tag. A tag is
   remembered per merchant, and it re-sorts that merchant's earlier spending too.
3. **Add cash income.** A form (amount, what it's from, date) records cash income into cash in
   hand deterministically, with no AI. Manually added income can be edited (amount, what it's from).
4. **Charts.** The dashboard opens on: spending by sector (donut plus ranking), this month day
   by day against last month, came in vs spent for the last 6 months, and top merchants. Every
   chart updates live as entries are posted.

## Non-goals

- Guessing a sector from an unknown merchant name. Unknown merchants stay "Not sorted yet" until
  tagged.
- Editing bank-SMS income or spending amounts (unchanged; the existing correction paths stay).
- Budgets, alerts and tips (piece 3 of CR-007, separate).
- A charting library. Charts are hand-drawn SVG.

## Anti-goals (would be failures even if it "works")

- Subtracting a withdrawal from Came in. Cash spent later would then count twice.
- Counting a withdrawal, or the move from the pocket into cash in hand, as spending.
- Any edit that mutates a posted entry. Every change is reversal plus replacement, with an audit trail.
- A chart that shows a figure the ledger did not confirm. Pending items never appear in totals.

## Constraints

- Accounting invariants in `AGENT.md` hold: balanced entries, integer minor units, an append-only
  ledger, and idempotent, retry-safe commands.
- All writes go through `/api` commands, and clients only read (RLS).
- Sector assignment is deterministic code, never AI output. AI may still supply `category` for
  a chat note, validated against the sector list.
- No new runtime dependencies.

## Sectors

The ids below are stored in the expense account `nominal:expense:<id>:BDT`. The labels are what
the user sees.

| id | label |
|----|-------|
| food | Food |
| transport | Transport |
| groceries | Groceries |
| shopping | Shopping |
| bills | Bills & recharge |
| health | Health |
| education | Education |
| family | Family |
| rent | Rent |
| other | Other |
| uncategorized | Not sorted yet |

Existing ids are folded into these for display and totals: `eating-out` → food and
`mobile-recharge` → bills. No ledger rewrite is needed.

Income uses its own labels, kept in the income account's category: rent → "House rent",
salary → "Salary", business → "Business", gift → "Gift", other → "Other".

## Approaches considered

**Cash pocket**

- (A, chosen) When a cash spend posts from cash in hand (`cash-main`) and the pocket
  (`cash-unassigned`) holds money, the same commit first posts a non-expense move of
  `min(pocket, amount)` from the pocket to cash in hand, then the spend. There is one spend
  transaction, so the history reads plainly, and the move uses the existing custody-transfer
  posting.
- (B) Fund the spend directly from the pocket. That fails when the pocket is smaller than the
  spend: it would need multi-leg intents, which `rebuildIntent` and the corrections don't support.
- (C) Route withdrawals straight into cash in hand and compute "unexplained" on the fly. That
  rewrites the cash count (release gate 32) and its audited adjustments. Rejected.

**Sector source**

- (A, chosen) A fixed known-merchant list plus user tags, applied at posting time. A new tag
  re-sorts that merchant's existing spends by reversal and replacement.
- (B) Sort at read time in the browser. Corrections and exports would disagree with the screen,
  and the ledger would hold no sector. Rejected.
- (C) Ask DeepSeek. Rejected by Mabrur ("don't guess"), and it costs quota.

**Merchant on the dashboard**

- (A, chosen) Store the normalized merchant on the transaction document (an optional field) and
  let the dashboard watch spend transactions for a date range.
- (B) Join in the browser through source events. The event watch is capped at 50 and doesn't
  cover a month. Rejected.

## Design

### 1. Cash pocket

- Decide/post stage: for an outgoing cash intent (purchase or fee) funded by `cash-main`, read
  the pocket's balance. If it's above zero, also post a custody transfer `cash-unassigned` →
  `cash-main` of `min(pocket, amount)`, in the same atomic commit as the spend, using the
  existing main-plus-fee posting pattern. The idempotency key is derived from the spend's key.
- The move is not spending and not income. The dashboard's Spent and Came in figures already
  ignore cash-to-cash moves; tests must prove it.
- Demo data shows a withdrawal followed by a cash spend lowering the unexplained amount.
- Tests: pocket ≥ spend, pocket < spend, pocket 0, replay (no second move), and a cash count
  after the move still reconciles.

### 2. Merchant and sector

- `normalizeMerchant(raw)`: trim, collapse whitespace, drop trailing city or country words
  (DHAKA, BD, BGD) and terminal ids. It returns a display name and a key (lowercase alphanumeric).
- `KNOWN_MERCHANTS`: key fragments mapped to sectors, matched by "key contains fragment". It
  starts with Foodpanda, Pathao (food when the text says "food", otherwise transport), Uber,
  Shohoz, Shwapno, Meena Bazar, Agora, Unimart, Daraz, Chaldal (groceries), Aarong, Bata, Apex,
  Grameenphone, Robi, Banglalink, Teletalk, DESCO, DPDC, Titas, Lazz Pharma, and common
  hospitals and diagnostic centres. The list lives in `packages/domain` with tests.
- New owner collection `merchantSectors`: `{ merchantKey, merchantName, sector, updatedAtMs }`,
  written only by `/api`.
- At posting, the category is chosen in this order: the user's tag for the merchant key, then
  `candidate.category` (parser or AI, validated against the sector list), then the known-list
  match, then `uncategorized`.
- The transaction document gains `merchant?: string` (the display name).
- Command `tagMerchant { merchantKey, sector }`: upserts the rule, then re-sorts every posted,
  unreversed spend with that merchant key whose category differs, by reversal and replacement
  (bounded per call; the response says how many were re-sorted and whether more remain).
- UI: tapping a merchant row (in Top merchants, or a "Not sorted yet" spend in Recent) opens a
  sector picker, and the result is reported honestly ("Sorted 4 spends from Foodpanda as Food").

### 3. Cash income

- Command `recordCashIncome { idempotencyKey, amountMinor, from: rent|salary|business|gift|other,
  note?, occurredOn: YYYY-MM-DD }`. It creates a chat source event with a structured, user-confirmed
  income candidate (source: cash), so the event appears in Recent and goes through the
  deterministic pipeline without AI. It posts income into `cash-main`.
- Command `editManualIncome { transactionId, amountMinor, from }` works only on transactions
  that came from `recordCashIncome`, via reversal and replacement (extending
  `correct-transaction` so it can change the category as well as the amount).
- UI: a "+ Add cash income" button on the dashboard opens a modal form that is keyboard-accessible
  and uses Dhaka dates. Manual income rows in Recent get an Edit button. The status shown is the
  server's (recorded / failed), never assumed.
- Demo mode shows the form, and saving says the demo saved nothing.

### 4. Charts

- Gateway: `watchSpendTransactions(fromMs, toMs)` (category and merchant per spend), plus the
  existing expense and income watches widened to a 6-month range. All are realtime, so the
  charts update when an entry posts.
- Layout (mobile first): the hero row (Spent / Came in) → Spending by sector (donut with the
  ranking beside or below it) → This month day by day (cumulative line, with last month dashed)
  → Came in vs Spent (6 paired bars) → Top merchants (top 5, tappable) → Money tracked → Recent.
- Each chart has a text equivalent: a visually hidden table or list giving the same numbers, and
  a one-line summary such as "Food took 38% of spending".
- Colours are the existing `--mt-cat-*` tokens per sector, fixed per sector id so a sector keeps
  its colour across charts. Not sorted yet is always grey. Animations respect reduced motion.
- Build with the `dataviz` skill.

## Left to the builder

- The exact SQL and RLS for `merchantSectors` and the transactions read, following the existing
  migration patterns, with cross-user tests through both RLS and `/api`.
- The merchant normalization edge cases, driven by the SMS fixtures.
- Chart geometry and the responsive breakpoints.

## Order and delivery

One PR per piece, in order 1 → 4, each green on `pnpm verify` and `pnpm test:e2e:fixture`
(plus `pnpm test:e2e` for pieces with backend changes). Progress is tracked in
`docs/superpowers/progress/income-spending-clarity.md` and committed after every task.
