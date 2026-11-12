# Sources from SMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read each SMS's source and remember it, show source chips, count credits as Came in and debits as Spent except paired own-account transfers, and let DeepSeek ask up to 3 questions about an SMS it can't read clearly (PRD CR-008, piece 2 of 4).

**Architecture:**
- **Sources:** a source is an ordinary ledger account (kind `bank`, or `cash` for Cash). The match stage creates it, plus a matching instrument, the first time a bank or wallet name and its last digits appear. Ids are deterministic, so repeats are idempotent.
- **Transfers:** pairing is a new match result, `transferCounterpart`. The post stage turns the other half into a transfer through `ReverseAndReplace`.
- **DeepSeek's questions:** these are a new AI output kind. They are stored on the source event as `clarifications`; a new `answerQuestion` callable reopens the event at `interpret`.
- **Web:** adds chips, Net money and Sources, and a question thread in the chat.

**Tech Stack:** TypeScript strict, Zod 4, Firebase Functions and Firestore (emulators, Java 21), Next.js 16, React 19, Vitest, Testing Library, axe-core, Playwright 1.51.1.

**Spec:** `docs/superpowers/specs/2026-11-12-sources-from-sms-design.md`

## Global Constraints

- **Workflow:**
  - Work on branch `sources-from-sms`, created from `master` (it already holds the spec, `967452d`/`585cdd5`).
  - After every task, update and commit `docs/superpowers/progress/sources-from-sms.md`, and append to `.superpowers/sdd/2026-11-12-sources-from-sms/progress.md`.
  - Commits carry no Co-Authored-By or attribution lines. Refer to the user as Mabrur.
  - Nothing is built before Mabrur approves the Task 1 mockup.
- **Accounting:**
  - Money is integer minor units only.
  - The ledger stays balanced and append-only. A transfer is made by `ReverseAndReplace`, never by editing.
  - A withdrawal is never spending; it still goes bank → system wallet `cash-unassigned` and asks where the cash went.
  - The AI never posts. A DeepSeek reading always needs the user's Record.
- **Source ids and names:**
  - Account id: `src-<provider>-<mask or "main">`. Instrument id: `inst-<provider>-<mask or "main">`. `<provider>` is a slug matching `^[a-z0-9-]{1,32}$`.
  - Display names: `BRAC`, `MTB`, `UCB`, `StanChart`, `Trust Bank`, `bKash`, `Upay`, `Nagad`; any other slug is title-cased.
  - Wallet providers: `bkash`, `upay`, `nagad`.
  - Labels:
    - a wallet → `<Name>`, e.g. `bKash`;
    - a card-kind SMS (`cardTransaction`, `cardPurchase`, `cardRepayment`) → `<Name> card ••<mask>`;
    - anything else → `<Name> ••<mask>`, or `<Name>` when there are no digits.
  - The Cash source is id `cash-main`, kind `cash`, name `Cash`, created at bootstrap.
- **Transfer pairing:**
  - Window: `TRANSFER_WINDOW_MS = 1_800_000` (30 minutes).
  - Automatic pairing needs exactly one counterpart: different account, opposite direction, same amount and currency, within the window, posted as a purchase, income, or an unclassified credit or debit.
  - The same day with no single match → `possibleCounterpart` (asks).
- **DeepSeek questions:**
  - At most `MAX_AI_QUESTIONS = 3` per event. Answers are 1–500 characters and are refused by `detectSensitiveContent`.
  - The new pending reason is `aiQuestion`.
  - The prompt version is `interpret-v2`.
- **Copy:**
  - Transfer chip: `Transfer`.
  - Transfer question: `Was this ৳X your own transfer from <source>?`
  - Skip button: `Skip`.
  - Dashboard: `Net money` and `Sources`.
- **Accessibility:** every new UI passes axe, and touch targets are at least 44 px.

## Review Focus

1. **Two identical SMS processed concurrently** must create one source, not two (deterministic ids plus `accounts.ensure`). Test in Task 3.
2. **Pasting the credit half before the debit half of a transfer** must pair as well as debit-first, and a retry must never correct twice (idempotency key `transfer-<eventId>`). Test in Task 4.
3. **A DeepSeek question round after a timeout** must not reuse the earlier round's stored result (a per-round provider id). Test in Task 5.
4. **An answer containing an OTP** is refused before it is stored or sent. Test in Task 5.
5. **A card SMS whose source already exists as a wallet or a bank account** with the same provider and digits resolves to that source and never creates a second one. Test in Task 3.

---

### Task 1: Mockup H (chips, Net money and Sources, the transfer question, DeepSeek's questions), Mabrur's gate

**Files:** Create `design/screens/H-sources.html` and `docs/superpowers/progress/sources-from-sms.md`.

- [ ] **Step 1:** Draw these frames in the style of mockup G:
  - H1: phone dashboard with Recent rows showing chips (`BRAC ••8888`, `bKash`, `MTB card ••2222`, `Cash`, and a Transfer row `BRAC ••8888 → bKash`), plus Net money and Sources (each chip with its month's in and out).
  - H2: chat showing a recorded SMS with its chip.
  - H3: the chat asking `Was this ৳10,000 your own transfer from BRAC ••8888?` with the answers Yes, transfer / No.
  - H4: DeepSeek asking a question under a pasted SMS, with a reply box and Skip.
  - H5: the reading after the answer: `৳2,000 · Spent · bKash · Record it?`.
  - H6: desktop.

  End with "Decisions to confirm".
- [ ] **Step 2: Render it.** Run `node $SCRATCH/mock.cjs design/screens/H-sources.html $SCRATCH/H.png`. Expected: no clipping. Send the PNG to Mabrur.
- [ ] **Step 3: Commit** (`design: add sources mockup`) and STOP until Mabrur approves.

### Task 2: Contracts

**Files:**
- Modify:
  - `packages/contracts/src/ai-interpretation.ts`
  - `packages/contracts/src/firestore/collections.ts`
  - `packages/contracts/src/commands/evidence.ts` and `registry.ts`
  - `packages/domain/src/evidence/candidate.ts` (no change: `provider` is reused)
  - `packages/domain/src/evidence/matching.ts` (type only)
- Test: `ai-interpretation.test.ts` (create if absent), `collections.test.ts`, `registry.test.ts`.

**Interfaces (produced):**
- **AI output:**
  - The `transaction` candidate gains optional `sourceName: string` (1–40 characters) and `sourceMask` (`/^\d{3,4}$/`).
  - A new variant: `{ kind: "question", text: string (1–300), options?: string[] (at most 4, each 1–40), candidate?: <the same candidate object> }`. Mabrur approved quick answers with mockup H.
- **Source event:**
  - Gains `clarifications: { question: string; options: string[]; answer: string | null; askedAtMs: number; answeredAtMs: number | null }[]`, with at most 3 items and a default of `[]`.
  - `pendingReason` adds `"aiQuestion"`.
  - `matchKind` adds `"transferCounterpart"`.
- **Commands:**
  - `answerQuestionRequest = { sourceEventId, answer?: string (1–500), skip?: true }`. Exactly one of `answer` and `skip`.
  - `answerQuestionResponse = { status: sourceEventStatus }`.
  - Registry entry `answerQuestion`, phase 1.
- **Domain:** `MatchResult` adds `{ kind: "transferCounterpart"; transactionId: string; accountId: string }`.

- [ ] **Step 1: Write the failing tests.**
  - The question variant parses.
  - An unknown key is refused.
  - `sourceMask` "12345" is refused.
  - A source event with 4 clarifications is refused.
  - An `answerQuestion` request with both or neither of `answer`/`skip` is refused.
  - A registry test lists `answerQuestion`.
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm exec vitest run packages/contracts`. Expected: FAIL.
- [ ] **Step 3: Implement the interfaces above.** Fix any exhaustive switches that break, such as `matchKind` and `pendingReason` labels in web copy. Existing stored events default `clarifications` to `[]` (`.default([])`).
- [ ] **Step 4: Run the checks.** Run: `pnpm exec vitest run packages && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** (`feat(contracts): sources, transfer pairing and AI questions`).

### Task 3: Sources remembered from SMS

**Files:**
- Create: `packages/application/src/pipeline/sources.ts` and `sources.test.ts`.
- Modify:
  - `stages/match.ts`
  - `candidate-to-intent.ts`
  - `use-cases/bootstrap-user.ts`
  - `pipeline/stages/deps.ts` (already has `accounts` and `instruments`)
- Test: `advance-source-event.test.ts`.

**Interfaces:**
- **Produces in `sources.ts`:**
  - `providerSlug(name: string): string | null`
  - `sourceLabel(provider: string, mask: string | undefined, kind: CandidateKind): string`
  - `ensureSource(deps, ownerId, { provider, mask, kind }): Promise<AccountId>`. It uses `accounts.ensure` with the deterministic id, then creates the instrument when absent: `mobileWallet` for wallet providers, `bankAccount` otherwise, because card type isn't tracked.
- **Produces:** `CASH_ACCOUNT_ID = "cash-main"`. Bootstrap creates it.
- **Match stage:**
  - When `uniqueAccount` finds nothing and the candidate has `provider` (from a parser) or `sourceName` (from AI, slugged into `provider`), it calls `ensureSource`.
  - When more than one account fits, it still asks.
  - A cash note (no provider, a purchase kind, the AI's `sourceName` "cash") resolves to `cash-main`.
- **`candidateToIntent` with uniform sources:**
  - `cardTransaction` / `cardPurchase` → a purchase funded by the source, when the source kind isn't `creditLiability`.
  - `unclassifiedDebit` → a purchase (category `uncategorized`).
  - `unclassifiedCredit` → income (category `uncategorized`).
  - `cardRepayment` with no destination → null (asks).

- [ ] **Step 1: Write the failing tests.**
  - `the first BRAC SMS creates "BRAC ••8888" and later ones reuse it`
  - `two identical SMS create one source` (run two intakes, then settle both)
  - `the same digits at two banks are two sources`
  - `a card SMS for an existing source reuses it`
  - `an unclassified debit is Spent and an unclassified credit is Came in`
  - `a cash note goes to Cash`
  - `every corpus SMS that names its bank or wallet reaches posted or a transfer question, never "which account"` (corpus loop)
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm exec vitest run packages/application`. Expected: FAIL.
- [ ] **Step 3: Implement the interfaces above.** Update the existing tests that expected "which account?" for unknown endings: they now expect a new source. Record each such change as a ruling.
- [ ] **Step 4: Run the checks.** Run: `pnpm exec vitest run packages apps/functions/src`. Expected: PASS.
- [ ] **Step 5: Commit** (`feat(application): remember sources read from SMS`).

### Task 4: Transfer pairing

**Files:**
- Modify:
  - `packages/domain/src/evidence/matching.ts` (and its test)
  - `stages/match.ts`, `stages/decide.ts`, `stages/post.ts`, `stages/deps.ts`
  - `apps/functions/src/composition.ts` (wire `ReverseAndReplace` into pipeline deps)
- Test: `matching.test.ts`, `advance-source-event.test.ts`.

**Interfaces:**
- **`MatchConfig`** gains `transferWindowMs`. `DEFAULT_MATCH_CONFIG = { windowMs: 600_000, transferWindowMs: 1_800_000 }`.
- **`matchCandidate`** returns `transferCounterpart` for exactly one counterpart within `transferWindowMs`. `ExistingTransaction` gains `intentType` so only purchase, income and unclassified rows qualify.
- **`PipelineDeps`** gains `correct: Pick<ReverseAndReplace, "execute">`.
- **Post stage on `transferCounterpart`:**
  - Correct the counterpart into `{ type: "transfer", from: <debit side source>, to: <credit side source> }`, using idempotency key `transfer-<eventId>` and rationale `Paired as your own transfer`.
  - Then commit the event as `posted`, with the eventPatch `{ resolvedDestinationAccountId: <counterpart account>, matchedTransactionId: "<counterpart>:repl" }`.
- **Decide:** `transferCounterpart` posts without asking (it's unique). `possibleCounterpart` asks `Was this ৳X your own transfer from <source>?`, and a "link" answer pairs it the same way.

- [ ] **Step 1: Write the failing tests.**
  - Domain: within 30 minutes → `transferCounterpart`; at 31 minutes, same day → `possibleCounterpart`; two counterparts → `ambiguous`; a counterpart that is already a transfer → none.
  - Pipeline:
    - `BRAC debit then bKash credit pair into one transfer: Spent and Came in unchanged`
    - `the credit first, then the debit, pairs the same way`
    - `replaying the pairing corrects once` (run post twice)
    - `a same-day pair asks, and "link" makes it a transfer`
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm exec vitest run packages/domain packages/application`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use the original's own source for `from`/`to` according to its direction.
- [ ] **Step 4: Run the checks.** Run: `pnpm exec vitest run packages apps/functions/src`. Expected: PASS.
- [ ] **Step 5: Commit** (`feat: pair own-account transfers`).

### Task 5: DeepSeek asks until it's clear

**Files:**
- Modify:
  - `packages/application/src/ports/ai-provider.ts`
  - `pipeline/ai-gateway.ts`
  - `stages/interpret.ts`
  - `source-event-guards.ts` and both source-event repositories (clarifications)
  - `packages/infrastructure/src/ai/deepseek-provider.ts`
  - new `prompts/interpret-v2.ts`
  - `fake-ai-provider.ts`
- Create: `packages/application/src/use-cases/answer-question.ts` (and its test), `apps/functions/src/callable/answer-question.ts` (export it in `index.ts`).

**Interfaces:**
- **AI port:**
  - `AiInterpretation` adds `{ kind: "question"; text: string; options: string[]; candidate: CandidateTransaction | null }`.
  - `AiContext` gains `clarifications: { question: string; answer: string }[]`.
- **AI gateway:** `AIGateway.interpret(ownerId, eventId, text, context, round: number)`. The provider id is `${id}` for round 0 and `${id}:r${round}` otherwise.
- **Interpret stage:**
  - A `question` with fewer than 3 clarifications → `pending/aiQuestion`, appending `{ question, answer: null, askedAtMs: now, answeredAtMs: null }` and storing any partial candidate.
  - At 3 clarifications → `pending/awaitingClarification` with the candidate so far.
- **Answering:** `AnswerQuestion.execute({ ownerId, sourceEventId, answer?, skip? })`.
  - It requires `pending/aiQuestion`, and the last clarification must be unanswered.
  - `answer` is checked with `detectSensitiveContent`; a hit throws `sensitiveEvidence`.
  - It sets the answer and reopens at interpret.
  - `skip` sets the status to `pending/awaitingClarification`, keeping the candidate so far.
- **Callable and web command:** `answerQuestion`, with the same contract.
- **Prompt:** `interpret-v2` sends the masked SMS plus the question-and-answer pairs. It asks for `sourceName`/`sourceMask` and allows `question` output; `fake-ai` can script questions.

- [ ] **Step 1: Write the failing tests.**
  - `DeepSeek's question parks as aiQuestion with the question stored`
  - `an answer goes back with the history and the next reading asks Record`
  - `the third question falls back to Record and Fix`
  - `a question round after a timeout makes a new provider call` (per-round key)
  - `an answer with an OTP is refused and nothing is stored`
  - `Skip shows the reading so far`
  - the callable's auth and the cross-user matrix entry for `answerQuestion` (update `cross-user.emulator.test.ts`)
  - `deepseek-provider` parses a question output.
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm exec vitest run packages apps/functions/src`. Expected: FAIL.
- [ ] **Step 3: Implement the interfaces above.**
- [ ] **Step 4: Run the checks.** Run: `pnpm exec vitest run packages apps/functions/src && pnpm test:emulator`. Expected: PASS, including the cross-user matrix coverage check.
- [ ] **Step 5: Commit** (`feat: DeepSeek asks until an SMS is clear`).

### Task 6: Web (chips, Net money and Sources, the question thread)

**Files:**
- Modify:
  - `apps/web/src/features/dashboard/recent-items.ts`, `RecentList.tsx`, `dashboard-view-model.ts`, `DashboardScreen.tsx`
  - `apps/web/src/features/chat/EvidenceBubble.tsx`, `chat-view-model.ts`
  - `shared/read-model-gateway.ts` and both gateways
  - `shared/commands.ts`, `fixture-commands.ts`
  - `shared/fixtures/household.ts`
  - `copy.ts`
- Create: `apps/web/src/features/chat/QuestionThread.tsx` (and its test), `features/dashboard/SourcesList.tsx`.

**Interfaces:**
- **Recent items:** `RecentItem` gains `chips: string[]` (source labels from account names; a transfer gets `["Transfer", from, to]`).
- **Reads:** `ReadModelGateway.watchSourceEntries(fromMs, toMs, onValue, onError)` reads ledger entries with `accountKind in ["bank","cash","familyCash"]` in the range.
- **Dashboard view:**
  - `DashboardView` replaces `availableMinor`/`cardsOwedMinor` with `netMoneyMinor` (the sum of all source balances, unexplained cash included).
  - `sources: { accountId, label, inMinor, outMinor }[]` for the month, sorted by `outMinor` descending.
- **Chat:**
  - `QuestionThread({ event, answerQuestion })` shows each question and answer, the latest question's options as quick-answer buttons (a tap sends the option as the answer), a reply box, and Skip.
  - The demo shows `COPY.demoUnavailable`.
- **Demo data:** sources named per Global Constraints, and one transfer pair.

- [ ] **Step 1: Write the failing tests.**
  - Recent rows show chips, and a transfer shows `Transfer` with both sources.
  - The Net money figure and Sources list for the demo month.
  - The question thread shows the history, submits an answer, and Skip calls skip.
  - An answer with an OTP shows the refusal copy.
  - axe on each.
- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm --filter web exec vitest run src`. Expected: FAIL.
- [ ] **Step 3: Implement to the approved mockup H.**
- [ ] **Step 4: Run the checks.** Run: `pnpm verify`. Expected: PASS. Take screenshots at 390 and 1280 px against mockup H.
- [ ] **Step 5: Commit** (`feat(web): source chips, net money and AI questions`).

### Task 7: End-to-end tests, final checks and records

- [ ] **Step 1: Emulator end-to-end tests** (`e2e/sms-to-posted.spec.ts`):
  - sign in;
  - paste the salary SMS → Came in rises and the chip shows the bank;
  - paste a debit and its matching wallet credit → both totals unchanged and a `Transfer` chip;
  - paste a card purchase → Spent rises with the card chip.

  The demo smoke test gets chips and Net money.
- [ ] **Step 2: Run everything.** Run: `pnpm verify && pnpm --filter web build && pnpm test:emulator && pnpm test:e2e && pnpm test:e2e:fixture`. Expected: all PASS.
- [ ] **Step 3: Update the records.** AGENT.md status says piece 2 is done (CR-008); the progress file gets open items (piece 3 tips, piece 4 going live). Commit (`docs: record sources from SMS`). Then run the final whole-branch review.
