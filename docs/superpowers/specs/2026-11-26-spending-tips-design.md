# Spending tips from DeepSeek — design (CR-007 piece 3)

Date: 2026-11-26. Status: approved by Mabrur 2026-11-27.

## Intent

Mabrur's product description (2026-11-12) ends with "tips to spend less". The dashboard already
shows what came in, what was spent and where (sector donut, day by day, top shops). Tips turn
those figures into two or three gentle, concrete suggestions. PRD CR-007 already accepted this
piece: "Tips come from DeepSeek using category totals only", never message text or account
names, paid from the AI budget.

## Decisions (Mabrur, 2026-11-26)

- **When:** made automatically when the dashboard opens, **at most once a day**, and only when the
  figures changed since the last tips. A **New tips** button asks for fresh ones.
- **What DeepSeek sees:** totals only. No shop names, SMS text, account names or card digits.
- **Language:** English. **Tone:** gentle and encouraging, never scolding.

## Goals

- Two or three tips about the month shown, each tied to a real figure.
- The figure in a tip is always ours and always right; the AI only writes advice around it.
- Tips cost almost nothing and never block the dashboard.

## Non-goals

- Budgets, goals, alerts or push notifications.
- Tips about past months (tips always describe the current month).
- Investment, loan, savings-product or tax advice.
- Bangla (later, if asked).
- Shop names in tips (would change CR-007's privacy promise; needs its own change request).

## Anti-goals (failure even if it works)

- A tip with a wrong or invented number.
- A tip that treats unexplained cash as spent (violates the cash invariant and the reminder
  wording rule).
- A tip that counts own-account transfers or ATM withdrawals as spending.
- Tips that drain the AI budget because a page reloads or a button is pressed repeatedly.
- A spinner or error where the dashboard used to be fast.

## Approaches considered

1. **Server works out the facts and asks DeepSeek** (chosen). The dashboard calls `/api`
   `refreshTips` when it opens. The server reads the user's ledger, computes the facts, decides
   whether new tips are due, calls DeepSeek through the existing AI gateway, validates and stores
   the result. The dashboard watches the stored tips. Numbers come from trusted code; quota and
   metering reuse what exists.
2. Nightly `pg_cron` job for every user. Rejected: spends the AI budget on people who never
   open the app; Mabrur asked for "when the dashboard opens".
3. Browser computes the facts and sends them. Rejected: `/api` would trust client numbers, and
   anyone could push arbitrary text to DeepSeek on the shared budget.

## Design

### 1. Facts (deterministic, `packages/application`)

A pure function `tipFacts(input) → TipFact[]` over the current Dhaka month to date and the same
days of the previous month. Input: posted expense and income ledger entries for both windows,
balances (for unexplained cash), and today's Dhaka date. It must use the same sector folding
(`foldSector`) and the same rules as the dashboard's figures, so a tip never disagrees with a
tile. Transfers and withdrawals are not expenses in the ledger, so they are already excluded.

**Shared figure rules (Claude's call).** Today the dashboard's rules (category of an entry,
netting refunds and reversals, `cash-unassigned` as unexplained cash, the "same days last
month" cutoff) live in `apps/web/.../dashboard-view-model.ts`, and the web app may not import
`packages/application`. These pure rules move into `packages/contracts` (which both sides already
import), the dashboard is switched to them without changing any figure (its existing tests must
pass unchanged), and `tipFacts` lives in `packages/application` on top of them. No copied logic.

Fact kinds (each has a stable `id`, a `kind`, the numbers, and a ready-to-show **headline** and
**detail** built by our code with `formatBdt`):

| kind | when | headline example | detail example |
|------|------|------------------|----------------|
| `sectorUp` | a sector is ≥20% **and** ≥৳500 above the same days last month | Food is up on last month | ৳2,940 by 6 Nov, against ৳2,130 by this time in October |
| `sectorDown` | a sector is ≥20% and ≥৳500 below | Transport is down on last month | ৳900 by 6 Nov, against ৳1,600 by this time in October |
| `topSector` | the largest sector is ≥30% of spending | Groceries took 37% of spending | ৳6,820 of ৳18,640 this month |
| `spentOverCameIn` | spent > came in this month to date, and came in > 0 | Spending is ahead of income | ৳18,640 spent, ৳12,000 came in so far this month |
| `unsorted` | "Not sorted yet" ≥ ৳500 | ৳2,500 isn't sorted yet | Sorting it shows where it went |
| `unexplainedCash` | unexplained cash > 0 | ৳5,000 cash isn't explained yet | Counting your cash keeps the picture right |

Selection: at most **3** facts, in this priority: the biggest `sectorUp`, `spentOverCameIn`,
`unsorted`, `unexplainedCash`, `topSector`, the biggest `sectorDown`. Percentages are whole
numbers rounded half up using integer arithmetic (no floats on money; percentages are display
only). `unexplainedCash` wording never says or implies the cash was spent.

**Enough data:** tips need at least 5 posted spends this month and at least 14 days since the
user's first posted spend. Otherwise the card says "Tips appear once there's a couple of weeks
of spending" and no AI call is made.

### 2. What DeepSeek gets and returns

Input: for each selected fact, its `id`, `kind`, sector label, headline and detail (already
formatted). Plus the day of month and days in month. Nothing else: no shop, account, SMS, user
name or email.

Output schema (Zod, in `packages/contracts`):

```ts
{ tips: Array<{ factId: string; advice: string }> } // at most 3
```

Rules enforced by the validator (deterministic, not by trusting the prompt):

- `factId` must be one we sent; duplicates dropped.
- `advice` is 1–2 sentences, at most 200 characters, and contains **no digits** and no `৳`.
  The figures are shown from our headline/detail, so the AI never states a number.
- Any advice that fails is dropped; its fact still shows with headline and detail only.

Prompt (`prompts/tips-v1.ts`, versioned): English, gentle, practical for a household in
Bangladesh, no investment/loan/tax advice, never says unexplained cash was spent, JSON only.

### 3. When tips are made (`refreshTips` command)

`/api` command `refreshTips({ force: boolean })`, owner-checked like every command.

1. Compute facts and **always save them** (no AI needed), so the card's figures always match the
   tiles. Advice is kept by `factId` while that fact is still selected (advice holds no numbers,
   so it stays true when amounts move); advice for a fact no longer selected is dropped, and a
   newly selected fact shows headline and detail without advice until the next AI call.
   `factsHash` covers the selected facts' ids and amounts.
2. Not enough data → store `{ status: "notEnoughData" }`, no AI call.
3. Not forced: if an AI call was already made **today (Dhaka day)**, or `factsHash` equals the
   hash at the last AI call → return `unchanged`, no AI call. The automatic call does not count
   toward the New tips limit.
4. Forced (**New tips**): always calls the AI, even if the figures haven't changed (Mabrur asked
   for fresh tips). At most **3 forced attempts per Dhaka day** per user; every attempt counts,
   including ones that end factsOnly. Beyond that return `limitReached` and the button says
   "You've had today's fresh tips. More tomorrow." Request keys are
   `tips-<dhakaDay>-auto` and `tips-<dhakaDay>-new-<n>`.
5. Call DeepSeek through the AI gateway (masking, quota reservation, metering, durable provider
   call, retries, timeout). Store model and prompt version.
6. Quota exhausted (including the tips share, see below), provider down, every advice rejected,
   or an unknown outcome (`retryLater` / `awaitUserDecision`) → keep the facts with
   `status: "factsOnly"` and any advice still valid from step 1. No resume path: the next
   eligible refresh makes a new call. The card shows the facts and a one-line note: "Advice is
   unavailable right now; these figures are up to date."

Storage: new owner collection `tips`, one document `current`:
`{ month, dhakaDay, factsHash, facts[], advice: Record<factId,string>, status, model?,
promptVersion?, generatedAtMs, forcedToday }`. Clients read it through the existing row-level
read policy and realtime; only `/api` writes it. Cross-user access test like every collection.

The provider-call machinery is keyed by source event and pipeline stage today. Tips need a key
that is not a source event (for example `tips-<uid>-<dhakaDay>-<n>`) and a stage or call kind
for tips. **Builder's call** how to extend `ProviderCallExecutor` (a `tips` stage plus a
synthetic key is the expected path), as long as quota, metering, idempotency and the provider
result purge keep working unchanged for SMS.

`AIProvider` gains `writeTips(input, requestKey, signal)`; `DeepSeekProvider` and
`FakeAIProvider` implement it (the fake returns fixed gentle advice for e2e).

### 4. The card (web)

Lives in the reserved `<section className={styles.tips}>` spot, at the top of the right column
on desktop, after the charts on phones (builder may adjust after the mock-up).

```
┌ Tips to spend less ─────────── Made today ┐
│ ● Food is up on last month                │
│   ৳2,940 by 6 Nov, against ৳2,130 by this │
│   time in October.                        │
│   A few more home-cooked dinners would    │
│   bring it back in line.                  │
│ ● ৳2,500 isn't sorted yet                 │
│   Sorting it shows where it went.  [Sort] │
│                              [ New tips ] │
└───────────────────────────────────────────┘
```

- The dot uses the sector colour; non-sector facts use the neutral colour.
- `unsorted` links to the existing sort flow; `unexplainedCash` opens the chat on the cash count.
- On open, the dashboard calls `refreshTips({ force: false })` once, in the background. While a
  call runs, the card keeps showing the stored tips with "Making new tips…" status text.
- Shown only for the current month (offset 0). Past months show no tips card.
- Demo mode shows fixed demo tips; New tips saves nothing.
- Status text is honest: "Made today", "Made 2 days ago", "Couldn't make new tips; showing the
  last ones" on failure. Never claims new tips that weren't stored.
- Accessible: a `section` with a heading, keyboard-reachable buttons, 44px targets.

**Mock-up approval:** before the web task is built, Mabrur sees a screenshot of the card in demo
mode (phone and desktop) and approves it.

## Constraints

- Money in integer minor units; percentages computed from integers.
- AI never touches the ledger; tips are read-only advice stored outside it.
- All AI calls via `/api`, metered, inside the per-user and global AI caps (CR-009).
- Structured logs only; no tip text or amounts in logs.
- This changes `/api`, so after merge the backend needs `pnpm deploy:supabase` (and the new
  collection's migration, if one is needed).

## Tests (acceptance)

- `tipFacts`: each kind's threshold edges; transfers and withdrawals never counted; unexplained
  cash never phrased as spending; ties; empty month; integer percentages.
- Validator: digits or `৳` in advice rejected; unknown `factId` dropped; too long dropped.
- `refreshTips`: unchanged facts → no call; same Dhaka day → no call; force limit of 3;
  not enough data → no call; quota exhausted → factsOnly; provider failure → factsOnly; model and
  prompt version stored; cross-user isolation through `/api` and RLS.
- Web: card states (ready, factsOnly, notEnoughData, making, failed), hidden on past months;
  demo-mode e2e path.

## Left to the builder

- Exact copy beyond the examples above (keep it plain and gentle).
- How the executor is extended for a non-source-event call (see §3).
- Whether `tips` needs a migration or fits the existing document table and policies.
- Card placement details after the mock-up.
