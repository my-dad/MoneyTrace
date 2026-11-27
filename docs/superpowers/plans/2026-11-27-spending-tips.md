# Spending Tips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two or three gentle tips on the dashboard, each tied to a figure our code works out, with advice written by DeepSeek from totals only.

**Architecture:** The dashboard's pure figure rules move into `packages/contracts` so the server and the web count the same way. A pure `tipFacts` in `packages/application` picks up to 3 facts. A `refreshTips` `/api` command saves those facts into `users/{uid}/tips/current`, and when one is due it asks DeepSeek for advice through the existing `AIGateway`/`ProviderCallExecutor` (quota, metering, durable call). Our validator checks the advice before it is stored. The web card watches that document.

**Tech Stack:** TypeScript strict, Zod, Vitest, PGlite, Next.js, Supabase Postgres (one `docs` table + RLS), Deno Edge Function.

**Spec:** `docs/superpowers/specs/2026-11-26-spending-tips-design.md` (approved 2026-11-27). Read it before any task.

## Global Constraints

- Money is integer minor units. Percentages use integer arithmetic only, rounded half up: `Math.floor((part * 200 + whole) / (whole * 2))`. No floats on money.
- DeepSeek sees only: fact `id`, `kind`, sector label, headline, detail, day of month, days in month. No shop, account, SMS, user name or email.
- Thresholds: up/down ≥20% **and** ≥৳500 (50 000 minor); top sector ≥30% of spending; unsorted ≥৳500; at most **3** facts; at most **3** forced attempts per Dhaka day; enough data = ≥5 posted spends this month **and** first posted spend ≥14 days ago.
- Selection priority: biggest `sectorUp`, `spentOverCameIn`, `unsorted`, `unexplainedCash`, `topSector`, biggest `sectorDown`.
- Advice: 1–2 sentences, ≤200 characters, no digits, no `৳`. Bad advice is dropped. Its fact still shows.
- Never say or imply unexplained cash was spent. Transfers and withdrawals are never spending.
- Copy (exact): card heading "Tips to spend less"; "Tips appear once there's a couple of weeks of spending"; "Advice is unavailable right now; these figures are up to date."; "You've had today's fresh tips. More tomorrow."; "Making new tips…"; "Couldn't make new tips; showing the last ones"; "Made today" / "Made 2 days ago"; button "New tips".
- Prompt version string: `tips-v1`. Request keys: `tips-<dhakaDay>-auto`, `tips-<dhakaDay>-new-<n>`.
- Structured logs only: no tip text and no amounts in logs.
- Commits: **no `Co-Authored-By` or other attribution lines** (Mabrur's standing rule).
- After every task, update `docs/superpowers/progress/spending-tips.md` (task table: task, state) and commit it with the task.
- `pnpm verify` must pass at the end of every task.

## Decisions the spec left open (made here)

- **"Tips share" (spec §3.6):** there is no separate tips budget. Tips reserve `DEFAULT_AI_ESTIMATE_MICRO_USD` against the user's normal limits and the global cap (`PlannedQuotaLedger`), and `quotaExhausted` from that reservation means `factsOnly`.
- **Executor key:** a `ProviderCallStage = PipelineStage | "tips"` type. The synthetic request key goes in the `sourceEventId` slot (`tips-2026-11-27-auto` fits `documentId`). SMS stages are unchanged.
- **Purge:** `PurgeProviderResults` walks terminal source events, so it never reaches tips calls. Their stored result is advice text with no digits and no identifiers. It stays until account deletion. Record this in the progress file.
- **Up/down need last month > 0.** A sector new this month is not "up". `uncategorized` is never an up, down or top fact (the `unsorted` fact covers it). Ties go to `SECTOR_IDS` order.
- **"First posted spend"** is looked for in the window read (previous month's start → now). A user whose only older spends are before that window waits until day 14.
- **Zero facts with enough data:** the doc is saved `status: "ready"` with `facts: []`, no AI call, outcome `unchanged`. The card says "Nothing stands out so far this month."
- **Validator extras** (they enforce the spec's "the AI never states a number"): Bangla digits `০-৯` and the words hundred, thousand, lakh, lac, crore, percent, taka, tk are rejected too. Advice for an `unexplainedCash` fact is rejected if it contains spent, spend, spending, wasted or lost.
- **`unsorted` action:** "Sort" opens the existing `SectorPicker` for the biggest unsorted shop this month (`merchantsOf` row with `sector === "uncategorized"` and `key !== ""`). If there is none, or `tagMerchant` is absent, no button.
- **Placement:** first child of the right column. On phones the columns stack, so it lands after the charts.

## Review Focus

1. **Number words or Bangla digits in advice** ("about five thousand taka", "৫০০"): rejected, fact shown without advice. Test in Task 4.
2. **Advice on unexplained cash that says it was spent:** rejected. Test in Task 4.
3. **Reload storm / two tabs / button mashing:** one automatic AI call per Dhaka day, and at most 3 forced. Test in Task 6.
4. **Month edges** (31 March against a 28-day February; the 1st of the month; a stored doc from last month): the comparison cutoff clamps to the last day, and a doc whose `month` is not this month is not shown until refreshed. Tests in Task 3 and Task 8.
5. **Corrections:** a reversed transaction plus its replacement count as one spend and one amount. Test in Task 3.

---

### Task 1: Shared figure rules in contracts

**Files:**
- Create: `packages/contracts/src/figures.ts`, `packages/contracts/src/figures.test.ts`, `docs/superpowers/progress/spending-tips.md`
- Modify: `packages/contracts/src/index.ts`, `apps/web/src/features/dashboard/dashboard-view-model.ts`, `apps/web/src/features/dashboard/chart-models.ts`, `apps/web/src/shared/dhaka-date.ts`

**Interfaces:**
- Produces (from `@moneytrace/contracts`):
  - `type FigureEntry = { transactionId: string; accountId: string; side: "debit" | "credit"; amountMinor: number; occurredAtMs: number }`
  - `const SYSTEM_CASH_ACCOUNT_ID = "cash-unassigned"`
  - `categoryOf(accountId: string): SectorId` (moved as is)
  - `netOf(rows: readonly FigureEntry[], positive: "debit" | "credit"): number` (the view model's `net`)
  - `sectorTotals(expenses: readonly FigureEntry[]): { sector: SectorId; amountMinor: number }[]`: positive totals only, biggest first, the stable sort `categoriesOf` and `sectorSlices` use today
  - `monthRange(nowMs: number, offset: number): { fromMs: number; toMs: number; label: string }` (moved as is)
  - `sameTimeLastMonthMs(nowMs: number): number` (today's `oneMonthEarlier`)
  - `dhakaDay(ms: number): string` (`YYYY-MM-DD`, Dhaka)
  - `MONTH_NAMES: readonly string[]`

- [ ] **Step 1: Write `figures.test.ts`**: `sameTimeLastMonthMs` of 31 Mar 2026 15:00 Dhaka is 28 Feb 2026 15:00 Dhaka. `sectorTotals` nets a refund (credit) against its sector and drops a sector at ≤0. `categoryOf("nominal:expense:eating-out:BDT") === "food"`. `dhakaDay` of 2026-11-26T18:30Z is `"2026-11-27"`. `monthRange(nov6, -1).label === "October 2026"`.
- [ ] **Step 2: Run** `pnpm --filter @moneytrace/contracts test figures` → FAIL (module missing).
- [ ] **Step 3: Move the code.** Move it into `figures.ts`, export it from `index.ts`, and make `dashboard-view-model.ts` and `chart-models.ts` import from contracts. The view model re-exports `categoryOf`, `monthRange` and `SYSTEM_CASH_ACCOUNT_ID` so existing imports keep working. `dhakaDate` in `dhaka-date.ts` delegates to `dhakaDay`. Do not change any figure.
- [ ] **Step 4: Run** `pnpm verify` → PASS. The existing dashboard and chart tests pass **unchanged** (don't edit them).
- [ ] **Step 5: Create the progress file** with the 9-task table (Task 1 done) and commit: `refactor: dashboard figure rules shared from contracts`.

### Task 2: Tips contracts, storage policy and the `tips` call stage

**Files:**
- Create: `packages/contracts/src/tips.ts`, `packages/contracts/src/tips.test.ts`, `packages/contracts/src/commands/tips.ts`, `supabase/migrations/20261127000000_tips_read_policy.sql`
- Modify: `packages/contracts/src/index.ts`, `packages/contracts/src/firestore/collections.ts`, `packages/contracts/src/firestore/owner-data-registry.ts`, `packages/contracts/src/commands/registry.ts`, `packages/domain/src/pipeline/source-event.ts` (or wherever `PipelineStage` is exported), `packages/application/src/pipeline/provider-call-executor.ts`, `packages/application/src/ports/provider-call-repository.ts`, `packages/application/src/ports/ai-usage-recorder.ts`, `packages/infrastructure/src/docstore/read-policy.test.ts`, matching tests in `collections.test.ts` / `owner-data-registry.test.ts` / `registry.test.ts`

**Interfaces:**
- Produces:
  - `TIP_KINDS = ["sectorUp","sectorDown","topSector","spentOverCameIn","unsorted","unexplainedCash"] as const`, `type TipKind`
  - `tipFactSchema`: `{ id: string (≤64, e.g. "sectorUp:food", "unsorted"); kind: TipKind; sector?: SectorId; amountMinor: nonNegative int; compareMinor?: nonNegative int; headline: 1–120 chars; detail: 1–200 chars }` strict. `type TipFact`
  - `tipsReplySchema` (AI output shape only, lenient): `{ tips: Array<{ factId: string ≤64; advice: string ≤1000 }> ≤10 }`. `type TipsReply`
  - `TIP_ADVICE_MAX = 200`, `MAX_TIPS = 3`, `FORCED_TIPS_PER_DAY = 3`
  - `OWNER_COLLECTIONS.tips`: `{ id: "current"; month: "YYYY-MM"; status: "ready" | "factsOnly" | "notEnoughData"; facts: TipFact[] (≤3); advice: Record<string, string(1–200)>; factsHash: string | null; generatedAtMs; aiDay: "YYYY-MM-DD" | null; aiFactsHash: string | null; adviceAtMs: epochMs | null; model?: string; promptVersion?: string; forcedDay: "YYYY-MM-DD" | null; forcedToday: count }` strict. `aiDay`/`aiFactsHash` describe the last AI call; `adviceAtMs` is when stored advice was last made.
  - `OWNER_DATA_REGISTRY.tips = keep()` (client-readable, until account deletion, exported)
  - `refreshTipsRequest = strictObject({ force: z.boolean() })`, `refreshTipsResponse = strictObject({ outcome: z.enum(["made","unchanged","factsOnly","notEnoughData","limitReached"]) })`, `COMMANDS.refreshTips` phase 1
  - Domain `type ProviderCallStage = PipelineStage | "tips"`, used by `ExecuteParams.stage`, `ProviderCallKey.stage`, `ProviderCallRecord.stage`, `AIUsageRecord.stage`. Contracts `providerCalls.stage` and `aiUsage.stage` accept `"tips"`. `sourceEvents.parkedStage`/lease stage do **not**.

- [ ] **Step 1: Write the failing tests.** `tips.test.ts`: a valid doc parses, an `advice` value of 201 chars fails, 4 facts fail. `read-policy.test.ts`: Alice can read `users/ALICE/tips/current`, Bob cannot, after applying the new migration (the test must exec `20261127000000_tips_read_policy.sql` after the original policy, and its registry-vs-policy check must use the newest policy text). `collections.test.ts`: a `providerCalls` doc with `stage: "tips"` parses, a `sourceEvents` doc with `parkedStage: "tips"` fails.
- [ ] **Step 2: Run** `pnpm verify` → the new tests FAIL.
- [ ] **Step 3: Implement the schemas and the stage type. Write the migration** (`drop policy … ; create policy docs_owner_read …` identical to `20261113000100` plus `'tips'` in the list, with the same header comment style).
- [ ] **Step 4: Run** `pnpm verify` → PASS.
- [ ] **Step 5: Update progress, then commit** `feat(contracts): tips document, refreshTips command and the tips call stage`.

### Task 3: `tipFacts`, the deterministic facts

**Files:**
- Create: `packages/application/src/tips/tip-facts.ts`, `packages/application/src/tips/tip-facts.test.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**
- Consumes: `FigureEntry`, `categoryOf`, `netOf`, `sectorTotals`, `monthRange`, `sameTimeLastMonthMs`, `SECTOR_LABELS`, `SECTOR_IDS`, `formatBdt`, `TipFact`, `MAX_TIPS` from contracts.
- Produces:
  - `type TipFactsInput = { nowMs: number; expenses: readonly FigureEntry[] /* expense-account entries, previous month's start → now */; income: readonly FigureEntry[] /* income-account entries, this month */; unexplainedCashMinor: number }`
  - `type TipFactsResult = { status: "notEnoughData" } | { status: "ready"; facts: TipFact[] }`
  - `tipFacts(input: TipFactsInput): TipFactsResult`
  - `percentOf(part: number, whole: number): number` (integer, half up)

Windows: current = `[monthRange(now,0).fromMs, now]`, previous = `[monthRange(now,-1).fromMs, sameTimeLastMonthMs(now)]`. A "posted spend" is a distinct `transactionId` with an expense debit in the current window. `…:rev` transactions don't count, and neither does an original that has a `:rev` (the replacement is its own transaction and counts).

- [ ] **Step 1: Write the failing tests** (now = 6 Nov 2026 12:00 Dhaka). Each pins exact strings:
  - Food ৳2,130 → ৳2,940: `{ id: "sectorUp:food", headline: "Food is up on last month", detail: "৳2,940 by 6 Nov, against ৳2,130 by this time in October" }`
  - Edges: prev ৳2,500 / cur ৳3,000 → included. Cur ৳2,999 → not. Prev ৳0 → no up fact. Down mirror: Transport ৳1,600 → ৳900 → `"Transport is down on last month"`, `"৳900 by 6 Nov, against ৳1,600 by this time in October"`.
  - Top: Groceries ৳6,820 of ৳18,640 → `"Groceries took 37% of spending"`, `"৳6,820 of ৳18,640 this month"`. Exactly 30% included, 29.99% not.
  - `spentOverCameIn`: `"Spending is ahead of income"`, `"৳18,640 spent, ৳12,000 came in so far this month"`. No fact when income is 0.
  - `unsorted` at ৳500 → `"৳500 isn't sorted yet"`, `"Sorting it shows where it went"`. At ৳499.99 → none. `uncategorized` never appears as up/down/top.
  - `unexplainedCash` ৳5,000 → `"৳5,000 cash isn't explained yet"`, `"Counting your cash keeps the picture right"`. Assert headline + detail don't match `/spen[dt]|wasted|lost/i`.
  - Priority and cap: all six kinds present → exactly `[sectorUp, spentOverCameIn, unsorted]`. The biggest up wins by minor difference. Ties go to `SECTOR_IDS` order.
  - Enough data: 4 spends → `notEnoughData`. 5 spends with first spend 13 days ago → `notEnoughData`. 14 days → ready.
  - Corrections: original + `:rev` + replacement = 1 spend, replacement amount only.
  - Month edge: now 31 Mar 2026. Feb spend on 28 Feb 20:00 counts as "by this time" only if ≤ now's time of day on the 28th.
  - `percentOf(6820, 18640) === 37`, `percentOf(1, 200) === 1` (0.5 rounds up).
- [ ] **Step 2: Run** `pnpm --filter @moneytrace/application test tip-facts` → FAIL.
- [ ] **Step 3: Implement `tipFacts`.**
- [ ] **Step 4: Run** the same → PASS. Then run `pnpm verify`.
- [ ] **Step 5: Update progress, then commit** `feat(application): tipFacts picks the month's figures for tips`.

### Task 4: Advice validator, `AIProvider.writeTips`, DeepSeek prompt

**Files:**
- Create: `packages/application/src/tips/validate-advice.ts` (+ `.test.ts`), `packages/infrastructure/src/ai/prompts/tips-v1.ts`
- Modify: `packages/application/src/ports/ai-provider.ts`, `packages/application/src/pipeline/ai-gateway.ts` (+ its test), `packages/application/src/testing/scripted-ai-provider.ts`, `packages/application/src/testing/ai-provider-contract.ts`, `packages/infrastructure/src/ai/deepseek-provider.ts` (+ test), `packages/infrastructure/src/ai/fake-ai-provider.ts`

**Interfaces:**
- Consumes: `TipFact`, `TipKind`, `TipsReply`, `tipsReplySchema`, `TIP_ADVICE_MAX`, `ProviderCallStage`.
- Produces:
  - `type TipsInput = { facts: { id: string; kind: TipKind; sectorLabel?: string; headline: string; detail: string }[]; dayOfMonth: number; daysInMonth: number }` (in `ports/ai-provider.ts`)
  - `AIProvider` gains `tipsPromptVersion: string` and `writeTips(input: TipsInput, requestKey: string, signal: AbortSignalLike): Promise<ProviderOutcome<TipsReply>>`
  - `AIGateway.writeTips(ownerId: OwnerId, requestKey: string, input: TipsInput): Promise<ExecuteResult<TipsReply>>`, executed with `sourceEventId: requestKey`, `stage: "tips"`, `provider: { id: provider.id, retrySafety }`, and the gateway's estimate. Also `get tipsIdentity(): { model: string; promptVersion: string }`.
  - `validateAdvice(reply: TipsReply, sent: readonly TipFact[]): Record<string, string>`: factId → trimmed advice.
  - `ScriptedAiProvider`: `scriptTips(...outcomes: ProviderOutcome<TipsReply>[])`, `tipsCalls: number`, `lastTipsInput: TipsInput | null`. The default is `{ kind: "success", value: { tips: [] } }`.
  - `FakeAIProvider.writeTips` returns, for each sent fact, `"A small, steady change here adds up over the month."`

- [ ] **Step 1: Write the failing tests.**
  - `validate-advice.test.ts`: unknown factId dropped. A duplicate keeps the first. 201 chars dropped. Three sentences dropped. Rejected: `"Save 500 a week."`, `"Keep ৳ aside."`, `"Try ৫ fewer trips."`, `"Spend about five thousand less."`, `"Put aside a few taka."`. `"Ate out less? Try cooking at home."` kept. For an `unexplainedCash` fact, `"Count it so you know where it was spent."` is dropped. Whitespace trimmed.
  - `ai-gateway.test.ts`: `writeTips` stores a provider call with `stage: "tips"` and `sourceEventId: "tips-2026-11-27-auto"`. A second call with the same key reuses the stored result (`tipsCalls === 1`). Quota exhausted → `{ kind: "quotaExhausted" }`.
  - `deepseek-provider.test.ts` (fake fetch): the request body has `model`, `response_format: json_object`, and messages whose user content contains each fact's headline and **no** other fields. A good JSON body → `success` with tips. Non-JSON content → `success` with `{ tips: [] }`. 429 → `definiteFailure`.
  - Contract: `writeTips` with one fact resolves `success` with an array (DeepSeek runs it with a canned fetch).
- [ ] **Step 2: Run** `pnpm verify` → the new tests FAIL.
- [ ] **Step 3: Implement.**
  - The prompt (`TIPS_PROMPT_VERSION = "tips-v1"`, `buildTipsMessages(input: TipsInput)`) is English, gentle and practical for a household in Bangladesh. It gives no investment, loan or tax advice, never says unexplained cash was spent, writes no numbers, gives one advice per factId of 1–2 sentences, and replies JSON only: `{"tips":[{"factId":…,"advice":…}]}`. The facts go inside a data fence like `interpret-v2`.
  - DeepSeek `MAX_OUTPUT_TOKENS` for tips is 400. Share the HTTP call with `interpretEvidence` instead of copying it.
- [ ] **Step 4: Run** `pnpm verify` → PASS.
- [ ] **Step 5: Update progress, then commit** `feat: DeepSeek writes tip advice, checked by our validator`.

### Task 5: `TipsRepository`

**Files:**
- Create: `packages/application/src/ports/tips-repository.ts`, `packages/application/src/testing/in-memory-tips.ts`, `packages/application/src/testing/tips-contract.ts`, `packages/infrastructure/src/firestore/firestore-tips-repository.ts` (+ PG contract test beside the other adapter suites)
- Modify: `packages/application/src/index.ts`, `packages/application/src/testing/index.ts`, `packages/infrastructure/src/index.ts`

**Interfaces:**
- Produces:
  - `type TipsDoc = z.output<typeof OWNER_COLLECTIONS.tips>`
  - `type TipsFields = Omit<TipsDoc, "id" | "forcedDay" | "forcedToday">`
  - `TipsRepository = { get(ownerId): Promise<TipsDoc | null>; save(ownerId, fields: TipsFields): Promise<void>; claimForced(ownerId, dhakaDay: string, max: number): Promise<number | null> }`
  - `save` merges and never touches `forcedDay`/`forcedToday`. On first create it sets `forcedDay: null, forcedToday: 0`. `claimForced` is one transaction: a new day resets the count to 0, then if count < max it increments and returns the new count, else returns null. A missing doc throws `DomainError("resourceNotFound")`.
  - `InMemoryTips`, `FirestoreTipsRepository(db: DocStore)`, at `ownerPath(owner, "tips", "current")`.

- [ ] **Step 1: Write `describeTipsRepositoryContract(make)`.** It covers: get on empty → null. save then get round-trips. A save after claims keeps `forcedToday`. Claims 1, 2, 3 → then null. The next day → 1. 4 concurrent claims at max 3 → exactly three non-null, values {1,2,3}. Run it against in-memory and PGlite.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement both adapters.**
- [ ] **Step 4: Run** `pnpm verify` → PASS.
- [ ] **Step 5: Update progress, then commit** `feat: tips repository with an atomic daily New tips count`.

### Task 6: `RefreshTips` use case

**Files:**
- Create: `packages/application/src/use-cases/refresh-tips.ts` (+ `.test.ts`)
- Modify: `packages/application/src/index.ts`

**Interfaces:**
- Consumes: `tipFacts`, `validateAdvice`, `TipsRepository`, `AIGateway.writeTips`/`tipsIdentity`, `LedgerReader.listEntriesInRange`/`getBalance`, `Hasher`, `Clock`, `Logger`, `dhakaDay`, `monthRange`, `SECTOR_LABELS`, `FORCED_TIPS_PER_DAY`.
- Produces:
  - `type TipsWriter = Pick<AIGateway, "writeTips" | "tipsIdentity">`
  - `class RefreshTips { constructor(deps: { reader: LedgerReader; tips: TipsRepository; writer: TipsWriter; hasher: Hasher; clock: Clock; logger: Logger }); execute(input: { ownerId: OwnerId; force: boolean }): Promise<{ outcome: "made" | "unchanged" | "factsOnly" | "notEnoughData" | "limitReached" }> }`

Flow (spec §3, exactly):
1. Read entries from the previous month's start to now. Expenses = `accountKind === "expense"`; income = `"income"` within this month. Unexplained cash = `max(0, getBalance(SYSTEM_CASH_ACCOUNT_ID))`.
2. `notEnoughData` → save `{ status: "notEnoughData", facts: [], advice: {}, factsHash: null, … }` and return `notEnoughData`, even when forced.
3. Save the facts first. `factsHash = sha256(JSON of [id, amountMinor, compareMinor ?? null] per fact)`. Advice is kept only for facts still selected. Status stays as stored unless no advice remains, which makes it `factsOnly`. Zero facts → `ready`, `unchanged`, no AI.
4. Not forced: if `aiDay === today` or `aiFactsHash === factsHash` → `unchanged`.
5. Forced: `n = claimForced(today, FORCED_TIPS_PER_DAY)`. If null → `limitReached`.
6. Call `writer.writeTips(owner, force ? \`tips-${today}-new-${n}\` : \`tips-${today}-auto\`, input)`. If the result is not `quotaExhausted`, set `aiDay = today` and `aiFactsHash = factsHash`.
7. On `result` with ≥1 valid advice → status `ready`, advice replaced, `adviceAtMs = now`, model and promptVersion stored, `made`. Anything else → `factsOnly`, with the advice still valid from step 3.
8. Log `tips.refreshed` with `{ outcome, factCount }` only.

- [ ] **Step 1: Write the failing tests** (in-memory ledger with posted transactions, `ScriptedAiProvider` behind a real `AIGateway` + `ProviderCallExecutor` from `testing/fake-provider`):
  - First open → `made`. The doc has 3 facts with advice, plus `model`, `promptVersion: "scripted…"`, `adviceAtMs`.
  - A second open the same day → `unchanged`, `tipsCalls === 1` (Review Focus 3).
  - The next day with the same figures → `unchanged`. The next day after a new spend changes a fact → `made`.
  - New tips ×4 in one day → `made, made, made, limitReached`, `tipsCalls === 3`. An auto call before them doesn't use up a forced slot.
  - 4 spends → `notEnoughData`, `tipsCalls === 0`.
  - Quota exhausted (limits 0) → `factsOnly`, facts saved, and `aiDay` stays null so a later open can try again.
  - Provider `definiteFailure` → `factsOnly`. A reply where every advice contains a digit → `factsOnly`, facts shown.
  - Figures move but the same facts are still selected → saved amounts updated, advice kept. A fact that drops out loses its advice.
  - A posted ATM withdrawal (bank → `cash-unassigned`) adds nothing to spending, and `unexplainedCash` appears instead.
  - The logger saw no `headline`, `detail`, `advice` or amount keys.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm verify` → PASS.
- [ ] **Step 5: Update progress, then commit** `feat(application): refreshTips saves figures and asks for advice when due`.

### Task 7: `/api` command and wiring

**Files:**
- Create: `apps/functions/src/callable/tips-commands.ts`
- Modify: `apps/functions/src/callable/registry.ts`, `apps/functions/src/composition.ts`, `apps/functions/src/api.test.ts`, `apps/functions/test/cross-user.test.ts`

**Interfaces:**
- Consumes: `RefreshTips`, `FirestoreTipsRepository`, `COMMANDS.refreshTips`.
- Produces: `refreshTips = command(COMMANDS.refreshTips, (ctx, data) => ctx.deps.refreshTips.execute({ ownerId: ctx.ownerId, force: data.force }))`, and `Deps.refreshTips: RefreshTips`, built **lazily** like `advanceSourceEvent` (it needs the AI key). It shares one `ProviderCallExecutor` configuration (providerCalls, quota, usage, clock, logger, `systemTimeoutSignal`) and `selectAiProvider(env)`.

- [ ] **Step 1: Write the failing tests.** `api.test.ts`: `refreshTips({ force: false })` for a new user → `{ outcome: "notEnoughData" }`. `{ force: "yes" }` → the invalid-argument reply. `cross-user.test.ts`: Bob's `refreshTips` never reads or writes Alice's `tips/current`, and Alice's doc stays unreadable to Bob through RLS.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm verify` and `pnpm smoke:supabase` → PASS.
- [ ] **Step 5: Update progress, then commit** `feat(functions): refreshTips command`.

### Task 8: Tips card, demo data, mock-up approval

**Files:**
- Create: `apps/web/src/features/dashboard/TipsCard.tsx` (+ `.test.tsx`), `apps/web/src/features/dashboard/tips-view.ts` (+ `.test.ts`)
- Modify: `apps/web/src/shared/read-model-gateway.ts`, `apps/web/src/shared/supabase-read-model-gateway.ts`, `apps/web/src/shared/in-memory-read-model-gateway.ts`, `apps/web/src/shared/fixtures/fixture-read-models.ts`, `apps/web/src/shared/fixtures/household.ts`, `apps/web/src/shared/commands.ts`, `apps/web/src/shared/copy.ts`, `apps/web/src/features/dashboard/dashboard.module.css`

**Interfaces:**
- Produces:
  - `type TipsRow = z.output<typeof OWNER_COLLECTIONS.tips>`, `ReadModelGateway.watchTips(onValue: (tips: TipsRow | null) => void, onError?): () => void` (Supabase reads `users/<uid>/tips/current`; in-memory gets `setTips`)
  - `"refreshTips"` added to `PHASE_ONE_COMMANDS`
  - `TIPS_COPY` in `copy.ts`, holding the Global Constraints copy plus `nothingStandsOut: "Nothing stands out so far this month."` and `madeAgo(days: number)`
  - `tipsView(doc: TipsRow | null, nowMs: number): TipsViewModel`, a pure function. `TipsViewModel = { kind: "none" } | { kind: "notEnoughData" } | { kind: "tips"; items: { id; kind; sector?; headline; detail; advice?: string }[]; age: string | null; factsOnly: boolean }`. A doc whose `month` is not this Dhaka month → `none` (Review Focus 4). `age` comes from `adviceAtMs` ("Made today", "Made 1 day ago", "Made 2 days ago").
  - `TipsCard({ view, busy, failed, limitReached, onNewTips, onSort?, onCountCash? })`: a `<section aria-labelledby>` with an `h2` "Tips to spend less", 44px buttons, and a dot coloured `var(--mt-sector-<sector>)` or the neutral colour. Status text: busy → "Making new tips…"; failed → "Couldn't make new tips; showing the last ones"; limitReached → the limit copy; factsOnly → the unavailable note.
  - Demo household: a tips doc for the current month with 3 facts (sectorUp food, unsorted, unexplainedCash) and advice on two of them.

- [ ] **Step 1: Write the failing tests.** `tips-view.test.ts`: a stale month → `none`; ages. `TipsCard.test.tsx`: each state shows its exact copy. Advice is rendered only when present. "New tips" is a button reachable by keyboard. The `unsorted` item shows "Sort" only with `onSort`, and `unexplainedCash` shows "Count my cash" only with `onCountCash`.
- [ ] **Step 2: Run** `pnpm --filter web test` → FAIL.
- [ ] **Step 3: Implement the gateway, copy, view and card.** Temporarily render the card in demo mode in the reserved spot so it can be screenshotted.
- [ ] **Step 4: Run** `pnpm verify` → PASS.
- [ ] **Step 5: Mock-up checkpoint. Stop here.** Run the demo build (`NEXT_PUBLIC_DATA_SOURCE=fixture`) and screenshot the dashboard at 390px and at desktop width. Send both to Mabrur and wait for approval or changes before Task 9.
- [ ] **Step 6: Update progress, then commit** `feat(web): tips card and demo tips`.

### Task 9: Dashboard wiring, e2e, docs

**Files:**
- Modify: `apps/web/src/features/dashboard/DashboardScreen.tsx` (+ test), `apps/web/src/app/page.tsx`, `e2e/fixture/dashboard.spec.ts`, `e2e/sms-to-posted.spec.ts` (or a new `e2e/tips.spec.ts` on the local stack), `AGENT.md`, `docs/superpowers/progress/spending-tips.md`

**Interfaces:**
- Consumes: `TipsCard`, `tipsView`, `watchTips`, `commands.refreshTips`.
- Produces: `DashboardScreen` prop `refreshTips?: (request: { force: boolean }) => Promise<{ outcome: … }>`.

Behaviour:
- Watch tips. Only when `offset === 0`, call `refreshTips({ force: false })` once per mount in the background (busy shown, card keeps stored tips).
- A rejection with `DemoUnavailableError` on the automatic call is silent. On New tips it uses the existing `useAction` demo message. Any other rejection → `failed`. `limitReached` → the limit copy.
- The card is hidden when `offset !== 0` and for a new user.
- The card is the first child of the right column. Remove the placeholder `<section aria-hidden>` and its `.tips:empty` rule.

- [ ] **Step 1: Write the failing tests.**
  - `DashboardScreen.test.tsx`: `refreshTips` is called once with `{ force: false }` on open and not again on re-render. Past month → no card, no call. New tips → `{ force: true }`. An automatic `DemoUnavailableError` shows no error.
  - Fixture e2e: the demo shows "Tips to spend less" and pressing New tips saves nothing.
  - Local-stack e2e (fake AI): after 5+ spends dated ≥14 days back, the card shows the fake advice text.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement. Wire `page.tsx`:** `refreshTips={(r) => commands.refreshTips(r)}` (fixture commands already reject).
- [ ] **Step 4: Run** `pnpm verify`, `pnpm --filter web build`, `pnpm test:e2e:fixture`, `pnpm test:e2e` → PASS. Report the actual output. If `test:e2e` hits the known exit-137 flake, rerun once and say so.
- [ ] **Step 5: Update the docs.** In `AGENT.md`, change "Next:" to say piece 3 is built. Finish the progress file, including the purge decision and "needs `pnpm deploy:supabase` and migration `20261127000000` after merge". Commit `feat(web): tips on the dashboard`.
