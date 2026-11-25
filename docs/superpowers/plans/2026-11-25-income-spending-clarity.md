# Income and Spending Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cash spends draw down withdrawn cash. Spending is sorted by SMS merchant and sector.
Cash income can be added and edited by hand. The dashboard opens on live charts.

**Architecture:**
- The ledger stays the single source of truth. Sector is the expense account's category, chosen
  deterministically at posting time.
- The merchant is a new optional field on the transaction document.
- Manual cash income enters as a pre-confirmed chat source event, so it runs through the normal
  pipeline and shows in Recent.
- Charts read only realtime ledger and transaction watches, so they update when entries post.

**Tech Stack:** TypeScript strict, Zod contracts, Supabase Postgres `DocStore`, Deno `/api`,
Next.js static export, Vitest + PGlite, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-25-income-spending-clarity-design.md`

## Global Constraints

- Money is integer minor units (BDT poisha) only. No floats, including in chart math (percentages
  use integer arithmetic; SVG coordinates may be floats).
- Ledger is append-only. Every change is a reversal plus a replacement (`ReverseAndReplace`).
- Withdrawals and pocket→cash moves are never Spent and never Came in.
- Sector ids: `food transport groceries shopping bills health education family rent other uncategorized`.
  Legacy folds: `eating-out`→`food`, `mobile-recharge`→`bills`.
- Sector labels: Food, Transport, Groceries, Shopping, Bills & recharge, Health, Education, Family,
  Rent, Other, Not sorted yet.
- Income sources: `rent salary business gift other`, labelled House rent, Salary, Business, Gift, Other.
- Clients never write. New writes are `/api` commands, validated by Zod and checked for ownership.
- `merchantSectors` is server-only and must not be added to the client read policy.
- Commits carry no Co-Authored-By lines (Mabrur's rule). Update and commit
  `docs/superpowers/progress/income-spending-clarity.md` after every task.
- One PR per piece: Tasks 1, 2–5, 6–7 and 8–9.

## Review Focus

1. **A crash after the pocket move but before the spend.** On retry the pocket balance is lower.
   The retry must not draw again or dead-letter on an idempotency conflict. Test it in Task 1.
2. **The same shop spelled differently**: `FOODPANDA BD DHAKA`, `Foodpanda`, `foodpanda ltd`. All
   must share one merchant key, so one tag sorts them all. Test it in Task 2.
3. **Cash income dated today near midnight Dhaka time, or in the future.** The date must be a
   Dhaka day, and a future date must be refused with a clear message. Test it in Task 6.
4. **Editing the same manual income twice.** The second edit must correct the live replacement,
   not the reversed original. Test it in Task 6.
5. **Charts with no spending, one sector only, or a refund larger than a sector's spend.** No
   NaN, no negative slices, and an empty state is shown. Test it in Task 8.

---

### Task 1: Cash spends draw from the withdrawn pocket

**Files:**
- Create: `packages/application/src/pipeline/pocket.ts`
- Modify: `packages/application/src/pipeline/stages/post.ts` (main posting block)
- Modify: `apps/web/src/shared/fixtures/household.ts` (the demo cash spend draws from the pocket)
- Test: `packages/application/src/pipeline/advance-source-event.test.ts` (new `describe("cash pocket")`)

**Interfaces:**
- Consumes: `SYSTEM_CASH_ACCOUNT_ID` (`cash-unassigned`), `deps.ledger`, `deps.post`, and the
  transfer intent `{ type: "transfer", from, to, amount }`.
- Produces: `pocketDraw(deps: PipelineDeps, ownerId: OwnerId, intent: PostingIntent, transactionId: string): Promise<PostingIntent | null>`.
  It returns a transfer from the pocket to the intent's cash account, or null.

- [ ] **Step 1: Write failing tests** in `describe("cash pocket")`. Each test withdraws through a
  BRAC withdrawal SMS fixture, then sends a cash chat note through the fake AI as a purchase from
  "Cash":
  - `withdraw 5,000 then spend 300 cash → pocket 4,700, cash-main 0, Spent 300`
  - `pocket 200, spend 300 → pocket 0, cash-main −100, one move of 200`
  - `pocket 0 → no move transaction exists (txn-<event>-pocket absent)`
  - `replay after the move posted → still one move, the spend posts, the event is posted not deadLetter`
    (simulate by running the post stage twice, with the second run after the move committed)
  - `a cash count after the move: unexplainedMinor equals the pocket balance`

- [ ] **Step 2: Run** `pnpm vitest run packages/application/src/pipeline/advance-source-event.test.ts -t "cash pocket"`.
  Expected: FAIL (pocket unchanged).

- [ ] **Step 3: Implement `pocketDraw`.**
  - Applies only to a `purchase` whose `funding.kind === "cash"`, or a `fee` whose
    `charged.kind === "cash"`, where the funding id is not `SYSTEM_CASH_ACCOUNT_ID`.
  - If `${transactionId}-pocket` already exists (`deps.ledger.getTransaction`), return null.
    The replay is already drawn.
  - Otherwise read the pocket's balance and return a transfer of `min(balance, amount)` when it
    is above 0.
  - In `postStage`, post it before the main posting with
    `post(\`${transactionId}-pocket\`, \`${event.id}-pocket\`, draw)`.

- [ ] **Step 4: Run** the same command. Expected: PASS. Then run `pnpm verify`.
  Expected: everything passes.

- [ ] **Step 5: Update the demo fixture** so the "Rickshaw and CNG" cash spend follows a pocket
  draw, and adjust `DashboardScreen.test.tsx` and `e2e/fixture/dashboard.spec.ts` to the new
  unexplained amount. Run `pnpm test:e2e:fixture`. Expected: 5 passed.

- [ ] **Step 6: Commit** with the message `feat: cash spends draw down withdrawn cash first`,
  then open the PR for piece 1.

### Task 2: Sectors, merchant normalization and the known-merchant list

**Files:**
- Create: `packages/contracts/src/sectors.ts` (exported from the package index)
- Create: `packages/domain/src/evidence/merchants.ts` (exported from the domain index)
- Test: `packages/contracts/src/sectors.test.ts`, `packages/domain/src/evidence/merchants.test.ts`

**Interfaces:**
- Produces, in `@moneytrace/contracts`:
  - `SECTOR_IDS` (readonly tuple, the order in Global Constraints)
  - `type SectorId`
  - `sectorSchema` (`z.enum(SECTOR_IDS)`)
  - `SECTOR_LABELS: Record<SectorId, string>`
  - `foldSector(category: string): SectorId` (legacy folds; unknown → `"other"`; `"uncategorized"` stays)
  - `INCOME_SOURCES`, `type IncomeSource`, `incomeSourceSchema`, `INCOME_LABELS`
- Produces, in `@moneytrace/domain`:
  - `normalizeMerchant(raw: string): { name: string; key: string } | null`
  - `knownSector(key: string, rawText?: string): SectorId | null`
  - `KNOWN_MERCHANTS: readonly [fragment: string, sector: SectorId][]`
  - The domain takes the sector ids as a string union of its own; contracts tests assert the two
    lists are equal, keeping the dependency direction (domain doesn't import contracts).

- [ ] **Step 1: Write failing tests.**
  - `foldSector`: `"eating-out"`→`"food"`, `"mobile-recharge"`→`"bills"`,
    `"uncategorized"`→`"uncategorized"`, `"weird"`→`"other"`.
  - `normalizeMerchant`:
    - `"FOODPANDA BD DHAKA"`, `"Foodpanda"` and `"foodpanda ltd"` all give key `"foodpanda"`.
    - `"  SHWAPNO   GULSHAN-2 "` gives name `"Shwapno Gulshan-2"` and key `"shwapnogulshan2"`.
    - `""` and `"123456"` give null.
    - It drops trailing `DHAKA`, `BD`, `BGD`, `BANGLADESH`, `LTD`, `LIMITED` and pure-digit words.
  - `knownSector`:
    - `"foodpanda"`→food, `"pathao"`→transport, `"pathao"` with raw text containing `food`→food.
    - `"shwapnogulshan2"`→groceries, `"daraz"`→shopping, `"grameenphone"`→bills, `"unknownshop"`→null.

- [ ] **Step 2: Run**
  `pnpm vitest run packages/contracts/src/sectors.test.ts packages/domain/src/evidence/merchants.test.ts`.
  Expected: FAIL.

- [ ] **Step 3: Implement.** The list covers at least the merchants named in the spec. Matching
  is "key includes fragment", longest fragment first.

- [ ] **Step 4: Run** the same command. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat: sectors and merchant normalization`.

### Task 3: Merchant and sector chosen at posting, kept through corrections

**Files:**
- Modify: `packages/contracts/src/firestore/collections.ts`. Add `merchant: name.optional()` to
  `transactions`, and add a new `merchantSectors` collection
  `{ id: documentId (= merchantKey), merchantName: name, sector: sectorSchema, updatedAtMs: epochMs }`
  to `OWNER_COLLECTIONS`.
- Modify: `packages/application/src/ports/ledger-reader.ts` (`TransactionRecord.merchant?: string`),
  `packages/application/src/use-cases/post-transaction.ts` (accept `merchant?: string`) and
  `packages/application/src/use-cases/reverse-and-replace.ts` (the replacement inherits `merchant`).
- Create: `packages/application/src/ports/merchant-sector-repository.ts`, an in-memory fake in
  `packages/application/src/testing/`, and a Postgres adapter in `packages/infrastructure/src/`,
  following the reconciliation repository's pattern.
- Create: `packages/application/src/pipeline/sector.ts`
- Modify: `packages/application/src/pipeline/stages/post.ts` and
  `packages/application/src/pipeline/candidate-to-intent.ts`. The category comes from a
  `ResolvedAccounts`-adjacent argument rather than from `candidate.category` directly.
- Test: the `describe("sector at posting")` block in `advance-source-event.test.ts`, and the
  adapter suite next to the other Postgres repository tests.

**Interfaces:**
- Consumes: `normalizeMerchant` and `knownSector` (Task 2), `foldSector` and `sectorSchema` (Task 2).
- Produces:
  - `MerchantSectorRepository = { get(ownerId, key): Promise<MerchantSectorRecord | null>; upsert(ownerId, rec): Promise<void>; }`
  - `chooseSector(deps, ownerId, candidate, retainedText): Promise<{ sector: string; merchant?: { name: string; key: string } }>`
    The order is: user tag → valid `candidate.category`, folded → `knownSector` → `"uncategorized"`.
  - `PipelineDeps.merchantSectors`, wired in `apps/functions/src/composition.ts`.

- [ ] **Step 1: Write failing tests.**
  - A BRAC POS SMS at `FOODPANDA BD DHAKA` posts to `nominal:expense:food:BDT`, and the
    transaction has `merchant: "Foodpanda"`.
  - The same SMS shape with an unknown shop posts to `uncategorized`.
  - After `upsert(owner, { id: "unknownshop", sector: "health" })`, the next SMS from that shop
    posts to `health`.
  - A bKash bill (parser category `bills`) stays `bills`.
  - Correcting the amount keeps `merchant` on the `:repl` transaction.
  - Adapter: upsert then get round-trips, and owner B's `get` of owner A's key returns null.

- [ ] **Step 2: Run** `pnpm vitest run -t "sector at posting"` and the adapter test.
  Expected: FAIL.

- [ ] **Step 3: Implement.** In `postStage`, call `chooseSector` and pass its `sector` into
  `candidateToIntent` (signature: `candidateToIntent(candidate, resolved, category = candidate.category ?? "uncategorized")`)
  and its `merchant.name` into `deps.post.execute` for the main posting only.

- [ ] **Step 4: Run** the same commands, then `pnpm verify`. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat: merchant and sector chosen when spending posts`.

### Task 4: `tagMerchant` re-sorts a merchant's spending

**Files:**
- Modify: `packages/contracts/src/commands/ledger.ts` and `registry.ts` (`tagMerchant`, phase 1)
- Create: `packages/application/src/use-cases/tag-merchant.ts`,
  `apps/functions/src/callable/spending-commands.ts`
- Modify: `apps/functions/src/callable/registry.ts`, `apps/functions/src/composition.ts`,
  `apps/web/src/shared/commands.ts` and `apps/web/src/shared/fixture-commands.ts`
- Test: `packages/application/src/use-cases/tag-merchant.test.ts`, and the `/api`
  cross-user suite where the other commands are tested

**Interfaces:**
- Request: `{ merchantKey: z.string().regex(/^[a-z0-9]{1,64}$/), merchantName: name, sector: sectorSchema }`
- Response: `{ resorted: count, more: z.boolean() }`
- `TagMerchant.execute({ ownerId, merchantKey, merchantName, sector }): Promise<{ resorted: number; more: boolean }>`.
  It needs `LedgerReader.listByMerchant(ownerId, merchantKey, limit): Promise<TransactionRecord[]>`,
  a new reader method that matches on `normalizeMerchant(merchant).key`.

- [ ] **Step 1: Write failing tests.**
  - Three posted Foodpanda spends in `uncategorized`, `tagMerchant(food)` → `resorted: 3`; each
    original is reversed and its `:repl` is in `food` with the same amount and merchant.
  - Calling it again → `resorted: 0` (idempotent; the key is `tag-<txnId>-<sector>`).
  - Already-reversed transactions are skipped.
  - More than 20 matches → `resorted: 20, more: true`.
  - Owner B can't re-sort owner A's spending through `/api` (cross-user test).

- [ ] **Step 2: Run** `pnpm vitest run packages/application/src/use-cases/tag-merchant.test.ts`.
  Expected: FAIL.

- [ ] **Step 3: Implement.** Upsert the rule first, then use `ReverseAndReplace` per live spend
  whose `foldSector(category) !== sector`, rebuilt by `rebuildIntent` with the new category
  (add an optional `category` parameter to `rebuildIntent`). The bound is 20 per call.

- [ ] **Step 4: Run** the same command, then `pnpm verify`. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat: tag a merchant's sector and re-sort its spending`.

### Task 5: Dashboard reads merchants, folds sectors, lets you tag

**Files:**
- Modify: `apps/web/src/shared/read-model-gateway.ts` (add
  `watchTransactions(fromMs, toMs, onValue, onError)` returning `TransactionRow[]`), plus its
  Supabase and in-memory implementations and the fixtures (merchants on demo spends)
- Modify: `apps/web/src/features/dashboard/dashboard-view-model.ts` (`categoriesOf` folds through
  `foldSector`; new `merchantsOf(expenses, transactions): MerchantRow[]`)
- Create: `apps/web/src/features/dashboard/SectorPicker.tsx` (a modal using `useModalFocus`)
- Modify: `CategoryChart.tsx` (labels from `SECTOR_LABELS`) and `RecentList.tsx` (a "Not sorted
  yet" spend gets a "Sort" button)
- Modify: `apps/web/src/shared/copy.ts`
- Test: `dashboard-view-model.test.ts`, `DashboardScreen.test.tsx`, `SectorPicker.test.tsx` and
  `e2e/fixture/dashboard.spec.ts`

**Interfaces:**
- `MerchantRow = { key: string; name: string; sector: SectorId; amountMinor: number }`, sorted by
  amount descending, net of reversals and refunds, with amounts ≤ 0 dropped.
- `SectorPicker({ merchantName, merchantKey, onDone })` calls `commands.tagMerchant`. It shows
  "Sorted N spends from X as Y", "…and more are being sorted" when `more` is true (it calls
  again until `more` is false), the demo-unavailable message, or the failure message.
- Unknown-merchant spends use key `""` and the name "No shop named". Those can't be tagged.

- [ ] **Step 1: Write failing tests.**
  - `categoriesOf` folds `eating-out` into food.
  - `merchantsOf` sums two Foodpanda entries and drops a fully refunded merchant.
  - Picking Food in `SectorPicker` sends `{ merchantKey: "foodpanda", merchantName: "Foodpanda", sector: "food" }`
    and shows "Sorted 3 spends from Foodpanda as Food".
  - e2e: in the demo, tapping Sort on a Not sorted yet row and picking a sector shows the
    demo-unavailable message.

- [ ] **Step 2: Run** the dashboard tests. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `pnpm verify` and `pnpm test:e2e:fixture`. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(web): merchants, sectors and one-tap sorting`.
  Open the PR for piece 2 (Tasks 2–5), and run `pnpm test:e2e` before opening it.

### Task 6: `recordCashIncome` and `editManualIncome`

**Files:**
- Modify: `packages/contracts/src/commands/ledger.ts` and `registry.ts`
- Modify: `packages/application/src/ports/source-event-repository.ts`. Add an optional
  `preset?: UserDecision & { resolvedAccountId: string }` to `SourceEventInput`; the Postgres
  and in-memory repositories store it.
- Modify: `packages/application/src/pipeline/stages/normalize.ts` and `interpret.ts`. When
  `event.userConfirmed && event.candidate !== null`, pass through without parsing or AI.
- Create: `packages/application/src/use-cases/record-cash-income.ts` and
  `packages/application/src/use-cases/edit-manual-income.ts`
- Modify: `rebuildIntent` (the optional category from Task 4), `apps/functions/src/callable/spending-commands.ts`,
  `apps/functions/src/composition.ts` and `apps/functions/src/callable/registry.ts`
- Modify: `apps/web/src/shared/commands.ts` and `fixture-commands.ts`
- Test: `record-cash-income.test.ts`, `edit-manual-income.test.ts`, and the `/api` cross-user suite

**Interfaces:**
- `recordCashIncome` request:
  `{ idempotencyKey: documentId, amountMinor: positiveMinorAmount, from: incomeSourceSchema, note: shortText.optional(), occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }`.
  Response: `{ sourceEventId: documentId, status: sourceEventStatus }`.
- `editManualIncome` request:
  `{ idempotencyKey: documentId, sourceEventId: documentId, amountMinor: positiveMinorAmount, from: incomeSourceSchema }`.
  Response: `{ status: z.enum(["recorded", "alreadyRecorded"]) }`.
- The event's `retainedText` is `Cash income · <INCOME_LABELS[from]>` plus ` · <note>` when a
  note is given.
- The preset candidate is `{ kind: "income", amountMinor, currency: "BDT", occurredAtMs, dateOnly: true, provider: "cash", counterparty: INCOME_LABELS[from], category: from }`
  with `resolvedAccountId: CASH_ACCOUNT_ID`.
- `occurredAtMs = Date.parse(\`${occurredOn}T12:00:00+06:00\`)`. A day after today's Dhaka day →
  `DomainError("invalidIntent", "that date is in the future")`.
- `sourceHash = sha256("manual-income\n" + idempotencyKey)`, so two identical incomes on the same
  day are both kept.
- Edit finds the live transaction by starting at `txn-<sourceEventId>` and following `:repl`
  while `reversedBy` is set. It refuses events whose `retainedText` doesn't start with `Cash income`.

- [ ] **Step 1: Write failing tests.**
  - Record 20,000 rent → the event is posted, Came in grows by 20,000, `cash-main` +20,000, the
    category is `rent`, and the AI fake is never called.
  - The same key again → the same event; there's still one transaction.
  - Two different keys with the same amount and day → two transactions.
  - `occurredOn` tomorrow in Dhaka → `invalidIntent`. `occurredOn` today, at 23:59 Dhaka time → accepted.
  - Edit 20,000 → 18,000 → the original is reversed and `:repl` holds 18,000. A second edit to
    salary 18,500 corrects `:repl` into `:repl:repl`.
  - Editing an SMS event → refused.
  - Owner B can't edit owner A's event through `/api`.

- [ ] **Step 2: Run** both new test files. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** the same tests, then `pnpm verify`. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat: record and edit cash income by hand`.

### Task 7: "+ Add cash income" form and Edit in Recent

**Files:**
- Create: `apps/web/src/features/dashboard/CashIncomeForm.tsx` (a modal using `useModalFocus`,
  `parseBdtInput` and Dhaka dates via `shared/dhaka-date.ts`) and `CashIncomeForm.test.tsx`
- Modify: `DashboardScreen.tsx` (a "+ Add cash income" button next to the month switch, shown
  also to new users on the welcome card), `RecentList.tsx` and `recent-items.ts` (`manualIncome: boolean`
  when `retainedText` starts with `Cash income`, with an Edit button opening the form prefilled),
  and `copy.ts`
- Test: `e2e/fixture/dashboard.spec.ts`

**Interfaces:**
- `CashIncomeForm({ mode: { kind: "add" } | { kind: "edit"; sourceEventId: string; amountMinor: number; from: IncomeSource }, onClose })`
- Status copy: "Recording…", "Recorded ৳20,000 as House rent", "Not recorded — try again", and
  the demo-unavailable message. Success is shown only after the command resolves. The idempotency
  key is created once per form open, so a retry reuses it.

- [ ] **Step 1: Write failing tests.**
  - Entering `20000`, House rent and today sends
    `recordCashIncome({ amountMinor: 2000000, from: "rent", occurredOn: <today Dhaka> , idempotencyKey })`.
  - An empty or zero amount disables Save.
  - A future date shows "Pick today or an earlier day".
  - Edit mode prefills and sends `editManualIncome`.
  - Escape closes and returns focus.
  - e2e: open the form in the demo, save, and see the demo-unavailable message.

- [ ] **Step 2: Run** the tests. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `pnpm verify`, `pnpm test:e2e:fixture` and `pnpm test:e2e`. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(web): add and edit cash income`, then open the
  PR for piece 3.

### Task 8: Chart view models

**Files:**
- Create: `apps/web/src/features/dashboard/chart-models.ts` and `chart-models.test.ts`

**Interfaces:**
- Consumes: `LedgerEntryRow`, `TransactionRow`, `foldSector`, `monthRange` and `dhakaDayLabel`.
- Produces:
  - `sectorSlices(expenses): { sector: SectorId; amountMinor: number; shareBp: number }[]`.
    `shareBp` is in basis points with integer math, and the shares sum to 10000 using a
    largest-remainder method.
  - `dailyCumulative(expenses, month, nowMs): { day: number; minor: number }[]`, by Dhaka day,
    stopping at today for the current month.
  - `monthlyTotals(expenses, income, months: { label; fromMs; toMs }[]): { label: string; inMinor: number; outMinor: number }[]`
  - `topMerchants(rows: MerchantRow[], n = 5)`

- [ ] **Step 1: Write failing tests.**
  - With no expenses, `sectorSlices` returns `[]`.
  - With one sector, it returns one slice at `shareBp: 10000`.
  - When a refund exceeds a sector's spend, that sector is dropped and there's no negative slice.
  - Shares 1/3 each sum to exactly 10000.
  - `dailyCumulative` puts an entry at 23:30 Dhaka time on the 3rd on day 3, not day 4.
  - `monthlyTotals` puts a reversal and replacement in the same month as the replacement only.

- [ ] **Step 2: Run**
  `pnpm vitest run apps/web/src/features/dashboard/chart-models.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** the same command. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(web): chart models`.

### Task 9: Live charts on the dashboard

Load the `dataviz` skill before writing chart code.

**Files:**
- Create in `apps/web/src/features/dashboard/`: `SectorDonut.tsx`, `DailyLine.tsx`,
  `MonthlyBars.tsx` and `TopMerchants.tsx`, plus `charts.module.css`
- Modify: `DashboardScreen.tsx` (layout order from the spec; add watches for the 6-month range of
  expense and income entries and for `watchTransactions`) and `CategoryChart.tsx` (becomes the
  ranking beside the donut)
- Modify: `apps/web/src/shared/fixtures/household.ts` (six months of demo income and spending)
- Test: `Charts.test.tsx` and `e2e/fixture/dashboard.spec.ts`

**Interfaces:**
- Each chart takes its model from Task 8 and renders an `<svg role="img" aria-labelledby>`, a
  visible one-line summary, and a visually hidden `<table>` with the same numbers.
- Sector colours are fixed by id:
  - food `--mt-cat-1`, transport `--mt-cat-3`, groceries `--mt-cat-4`, shopping `--mt-cat-5`
  - bills `--mt-cat-6`, health `#0F766E`, education `#4338CA`, family `#BE185D`, rent `#92400E`
  - other `--mt-cat-2`, uncategorized `--mt-cat-none`
- Tapping a top merchant opens `SectorPicker`.

- [ ] **Step 1: Write failing tests.**
  - With demo data, the donut summary reads "<top sector> took N% of spending", and the hidden
    table lists each sector with its amount.
  - When the gateway pushes a new expense entry, the donut table updates without a reload
    (in-memory gateway `emit`).
  - With no spending, "No spending yet this month" is shown and no `<svg>` is rendered.
  - e2e: the four chart headings are visible on phone, and the axe check stays green if present.

- [ ] **Step 2: Run** the tests. Expected: FAIL.

- [ ] **Step 3: Implement.** Animate with the existing motion tokens, honour reduced motion, and
  use no library.

- [ ] **Step 4: Run** `pnpm verify` and `pnpm test:e2e:fixture`. Expected: PASS. Take phone and
  desktop screenshots and check them by eye.

- [ ] **Step 5: Commit** with the message `feat(web): live charts on the dashboard`, then open
  the PR for piece 4.
