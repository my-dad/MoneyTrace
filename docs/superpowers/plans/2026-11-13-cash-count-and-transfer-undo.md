# Cash Count and Transfer Undo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two release blockers. First, PRD release gate 32: a cash count that shows any gap and never adjusts silently. Second, CR-008 §9: a "Not a transfer" undo that splits a wrongly paired transfer back into Spent and Came in.

**Architecture:**
- **Cash count:** the existing phase-3 contracts `recordReconciliation` and `recordAdjustment` get real handlers.
  - A count compares the counted amount with the sum of every active `cash` account. That includes `cash-main` and the system wallet `cash-unassigned`, and leaves out `familyCash`.
  - Every count is stored as a `reconciliations` doc. A non-zero gap is stored together with an open `reconciliationDifference` follow-up.
  - Adjust posts one `adjustment` transaction to `cash-main`, then marks the count `adjusted` and resolves its follow-up.
- **Transfer undo:** a new `splitTransfer` command reverses the paired transfer (`txn-A:repl`). In the same atomic ledger write it replaces it with A's original intent and posts B's own intent as `txn-<B>`. The ledger writer gains an optional `alsoPost` on corrections. The source event B is then re-marked as unmatched.
- **Web:**
  - The chat gets a "Count my cash" quick action, a count card, a gap card with three actions, an adjust form, and a "Not a transfer?" button on paired transfers.
  - The dashboard's unexplained-cash box opens the chat on the count card.

**Tech Stack:** TypeScript strict, Zod 4, Firebase Functions and Firestore (emulators, Java 21), Next.js 16, React 19, Vitest, Testing Library, axe-core, Playwright 1.51.1.

**Spec:** this plan's design is mockup I, `design/screens/I-cash-count-undo.html`, which Mabrur approved on 2026-11-13. Its "How it behaves" notes are the behavioural spec. Background: PRD §14 gate 32 and §5.5 item 24; `docs/superpowers/specs/2026-11-12-sources-from-sms-design.md` §9.

## Global Constraints

- **Workflow:**
  - Work on branch `cash-count-undo`, created from `master`.
  - After every task, update and commit `docs/superpowers/progress/cash-count-undo.md`.
  - Commits carry no Co-Authored-By or attribution lines. Refer to the user as Mabrur.
- **Accounting:**
  - Money is integer minor units only.
  - The ledger stays balanced and append-only. The undo is a reversal plus replacements in one atomic write, never an edit.
  - A cash gap is never spending. An adjustment posts only against `nominal:equity:adjustment:<currency>` through the existing `adjustmentStrategy`, needs a non-blank `cause`, and has `authorizedBy` = the owner id.
  - Nothing changes a balance unless the user taps Adjust or "Yes, count separately".
- **Cash count numbers:**
  - `expectedMinor` = the sum of `getBalance` over the owner's active accounts with `kind === "cash"` and `currency === request.currency`.
  - `unexplainedMinor` = the balance of `cash-unassigned`. `cashMinor` = `expectedMinor − unexplainedMinor`.
  - `differenceMinor` = `countedMinor − expectedMinor`. `countedMinor ≥ 0`; ৳0 is a valid count.
  - The reconciliation id is `recon-<idempotencyKey>`, with `accountId: "cash-main"`, `kind: "cashCount"`, and `asOfMs` = server clock.
  - `reviewStatus` is `"reviewed"` when the difference is 0, otherwise `"open"`.
  - A non-zero gap gets follow-up `fu-<reconciliationId>`: trigger `reconciliationDifference`, `targetAccountId: "cash-main"`, `targetReconciliationId: <reconciliationId>`, `dueAtMs` = now.
  - A new count sets every earlier `open` cash-count reconciliation to `dismissed` and resolves its follow-up with resolution `"superseded"`.
- **Adjustment:**
  - The server derives the direction and amount from the stored reconciliation. The client never sends them.
  - Key `adjust-<reconciliationId>`, transaction id `txn-adjust-<reconciliationId>`, `occurredAtMs` = the count's `asOfMs`, account `cash-main`.
  - Refused with `invalidTransition` unless the count is `open`. A replay of an already-adjusted count returns `alreadyRecorded`.
- **Split:**
  - The key is `split-<sourceEventId>`, derived on the server. The rationale is `Not a transfer: counted separately`.
  - The replacement of A gets id `txn-A:repl:repl`, which `ReverseAndReplace` names. B's own posting gets `txn-<B id>`.
  - Afterwards event B has `matchKind: "none"`, `matchedTransactionId: "txn-<B id>"` and `resolvedDestinationAccountId: null`.
- **Copy:** the strings below are exact. `৳X` means `formatBdt`. Signed amounts use `−` (U+2212).
  - Quick action and dashboard link: `Count my cash`.
  - Count card: `How much cash do you have right now?`, then `Count your wallet and any cash at home. Leave out cash family members are holding.` Button: `Check`.
  - Gap headline: `৳X isn't accounted for` when the count is short, `৳X more than expected` when it is over. Rows: `Cash`, `Not yet explained`, `The app expected`, `You counted`, `Difference`.
  - Gap note: `Nothing has been changed, and this isn't counted as spending.`
  - Gap actions: `Tell me what it was for`, `Adjust to my count…`, `Leave it open`.
  - Follow-up question (stored), with the comparison word `less`/`more`: `Your cash count was ৳X less than expected. What explains the difference?`
  - Match: `Recorded · Your count matches. ৳X — nothing to do.`
  - Adjust form: `Adjust your cash to ৳X?`, a field labelled `Why is it different? (required)`, and the note `Recorded as a cash adjustment of −৳X with your reason. It is not counted as spending.` Use `+৳X` for an increase. Buttons: `Adjust`, `Cancel`.
  - Adjusted: `Recorded · Cash now matches your count of ৳X. The ৳Y adjustment is saved with your reason.`
  - "Tell me what it was for" focuses the composer and sets its placeholder to `e.g. ৳500 rickshaw and lunch, ৳200 to Rafi`.
  - Split button: `Not a transfer?`. Confirm title: `Count these two separately?`. Rows: `Spent, from <source>` and `Came in, to <source>`. Note: `The transfer is reversed and both are recorded again, with the change kept in the history.` Buttons: `Yes, count separately` and `Keep as transfer`.
  - Split done: `Recorded · Counted separately: Spent ৳X and Came in ৳X.`
  - Mockup difference, deliberate: the adjust note drops "you can correct it later", because no correction UI exists yet. "Cash is now ৳X" becomes "Cash now matches your count of ৳X", because other postings may land in between. Record both in the progress file.
- **Accessibility:** every new UI passes axe, touch targets are at least 44 px, the amount field uses `inputMode="decimal"`, and errors use `role="alert"`.

## Review Focus

1. **Counting ৳0 (an empty wallet)** must be accepted. `parseBdtInput` rejects 0 today, so the count uses `parseBdtInput(text, { allowZero: true })`. Test in Task 7.
2. **A double tap on Check, or a retry after a lost reply,** must store one count and one follow-up. The client keeps one idempotency key per attempt, and the server creates the doc only if it's absent. Test in Task 3.
3. **Adjusting an older count after a newer count exists** is refused (the old one is `dismissed`), so the cash can't be adjusted twice for one gap. Test in Task 4.
4. **Tapping "Not a transfer" twice, or a crash between the ledger write and the event update,** must never reverse twice. A second call returns `alreadyRecorded` and finishes the event update. Test in Task 5.
5. **Splitting a transfer the user has since corrected** (`txn-A:repl` is no longer `posted`) is refused with no partial writes. Test in Task 5.

---

### Task 1: Contracts and records

**Files:**
- Modify: `packages/contracts/src/commands/ledger.ts`, `packages/contracts/src/commands/evidence.ts`, `packages/contracts/src/commands/registry.ts`, `packages/contracts/src/firestore/collections.ts` (followUps)
- Modify: `packages/application/src/ports/follow-up-repository.ts` (`targetReconciliationId?: string` on `FollowUpRecord`)
- Modify: `apps/web/src/shared/commands.ts` (add the three commands to `PHASE_ONE_COMMANDS`), `apps/web/src/shared/fixtures/household.ts` (give `fu-home-count` the field `targetReconciliationId: "recon-home-1"`)
- Create: `docs/superpowers/progress/cash-count-undo.md`; commit `design/screens/I-cash-count-undo.html` and this plan
- Test: `packages/contracts/src/commands/registry.test.ts`, `packages/contracts/src/firestore/collections.test.ts`

**Interfaces:**
- Produces:
  - `recordReconciliationRequest = { idempotencyKey: documentId, countedMinor: nonNegativeMinorAmount, currency }`. `accountId` and `countedAtMs` are removed: the server picks `cash-main` and the time.
  - `recordReconciliationResponse = { reconciliationId, status: "recorded"|"alreadyRecorded", countedMinor, expectedMinor, cashMinor, unexplainedMinor, differenceMinor: int, followUpId?: documentId }`.
  - `recordAdjustmentRequest = { reconciliationId: documentId, cause: shortText }` and `recordAdjustmentResponse = { transactionId, status, countedMinor, adjustmentMinor: positive }`.
  - `splitTransferRequest = { sourceEventId: documentId }` and `splitTransferResponse = { spentTransactionId, cameInTransactionId, amountMinor: positive, status }`. It is registered as `splitTransfer`, in `ledger.ts`.
  - followUps get `targetReconciliationId: documentId.optional()`.
  - `recordReconciliation`, `recordAdjustment` and `splitTransfer` get `phase: 1`, because their handlers ship now.

- [ ] **Step 1:** Create the branch, then commit the mockup and this plan.
- [ ] **Step 2: Write the failing tests.** `registry.test.ts`: `splitTransfer` exists; `recordReconciliation` accepts `{idempotencyKey:"k", countedMinor:0, currency:"BDT"}` and rejects `countedMinor:-1` and `accountId`; `recordAdjustment` rejects `direction` and `amountMinor` (strict); `cause:""` is rejected. `collections.test.ts`: a follow-up with `targetReconciliationId` parses.
- [ ] **Step 3:** Run `pnpm vitest run packages/contracts`. Expected: FAIL.
- [ ] **Step 4:** Make the schema changes above. Fix the compile errors this causes, then run `pnpm verify`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: contracts for cash count, adjustment and transfer split`, along with the progress file.

### Task 2: Ledger, a second posting inside a correction

**Files:**
- Modify: `packages/application/src/ports/ledger-writer.ts` (`CorrectionCommit`), `packages/infrastructure/src/firestore/firestore-ledger-writer.ts` (`commitCorrection`), `packages/application/src/testing/in-memory-ledger.ts`, `packages/application/src/use-cases/reverse-and-replace.ts`
- Test: `packages/application/src/testing/ledger-contract.ts` (runs against in-memory and Firestore), `packages/application/src/use-cases/reverse-and-replace.test.ts`

**Interfaces:**
- Produces:
  - `CorrectionCommit.alsoPost?: { transaction: TransactionRecord; entries: readonly EntryDraft[] }`. This is a new transaction written in the same atomic step. It has no `correctionOf`. It must not already exist (otherwise `invalidTransition`), it must balance, and its entries pass the same cutover check as a replacement. It is allowed only together with a `replacement`.
  - `ReverseAndReplace.execute` input gains `alsoPost?: { transactionId: TransactionId; intent: PostingIntent; occurredAtMs: number; sourceEventIds: readonly SourceEventId[] }`. Its entries come from `resolveIntent`, and its category and audit details come the way the replacement's do. It goes into the payload hash under `extra.alsoPost`, so the same key with a different `alsoPost` is an `idempotencyConflict`.

- [ ] **Step 1: Write the failing contract tests** in `ledger-contract.ts`:
  - `correction with alsoPost writes reversal, replacement and the extra transaction together`: the balances of all touched accounts change, and the extra transaction is `posted`.
  - `alsoPost whose id already exists is refused and nothing is written`: the original stays `posted`.
  - `a replay with the same key and alsoPost is duplicate`.
  - In `reverse-and-replace.test.ts`: the same key with a different `alsoPost` amount returns `idempotencyConflict`.
- [ ] **Step 2:** Run `pnpm vitest run packages/application` and `pnpm test:emulator:core`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement it in the port's doc comment, the in-memory ledger, the Firestore writer (read the `alsoPost` id inside the transaction, stage it with `create`, include its entries in `touched`) and `ReverseAndReplace`.
- [ ] **Step 4:** Run the same two commands. Expected: PASS.
- [ ] **Step 5:** Commit `feat: corrections can post one extra transaction atomically`.

### Task 3: Record a cash count

**Files:**
- Create: `packages/application/src/ports/reconciliation-repository.ts`, `packages/application/src/testing/in-memory-reconciliations.ts`, `packages/application/src/testing/reconciliation-contract.ts`, `packages/infrastructure/src/firestore/firestore-reconciliation-repository.ts`, `packages/application/src/use-cases/record-cash-count.ts`
- Modify: `packages/application/src/ports/account-repository.ts` (add `list`), `packages/infrastructure/src/firestore/firestore-account-repository.ts`, the in-memory account repository (in `in-memory-ledger.ts`), `packages/application/src/index.ts`, `packages/application/src/testing/index.ts`, `packages/infrastructure/src/index.ts`
- Test: `packages/application/src/use-cases/record-cash-count.test.ts`; the contract file runs against Firestore in the infrastructure emulator suite, the same way `follow-up-contract.ts` does

**Interfaces:**
- Consumes: `LedgerReader.getBalance`, `FollowUpRepository`, `Clock`, `SYSTEM_CASH_ACCOUNT_ID`, `CASH_ACCOUNT_ID`.
- Produces:
  - `AccountRepository.list(ownerId): Promise<AccountRecord[]>`.
  - `ReconciliationRecord`, which mirrors the `reconciliations` schema.
  - `ReconciliationRepository`:
    - `get(ownerId, id): Promise<ReconciliationRecord | null>`
    - `recordCount(ownerId, rec: ReconciliationRecord, followUp: FollowUpRecord | null): Promise<"created" | "exists">`: creates the reconciliation and the follow-up atomically, only if the reconciliation id is free.
    - `listOpenCashCounts(ownerId): Promise<ReconciliationRecord[]>`
    - `markStatus(ownerId, id, status: "adjusted" | "dismissed", adjustmentTransactionId: string | null, nowMs): Promise<"updated" | "notOpen">`
  - `class RecordCashCount { execute({ ownerId, idempotencyKey, countedMinor, currency }): Promise<recordReconciliationResponse shape> }`.

- [ ] **Step 1: Write the failing tests** in `record-cash-count.test.ts`, using the in-memory world. Seed `cash-main` = 150000, `cash-unassigned` = 150000, a `familyCash` account = 900000 and a `bank` = 5000000.
  - `a short count shows the gap and changes nothing`: counted 230000 gives `expectedMinor` 300000, `cashMinor` 150000, `unexplainedMinor` 150000 and `differenceMinor` −70000. Every balance is unchanged. One open follow-up has question `Your cash count was ৳700 less than expected. What explains the difference?`, `targetReconciliationId: "recon-k1"` and `followUpId: "fu-recon-k1"`.
  - `a matching count is reviewed with no follow-up`: counted 300000 gives `reviewStatus "reviewed"` and no `followUpId`.
  - `counting zero is allowed`: counted 0 gives a difference of −300000.
  - `the same key twice stores one count and one follow-up`: the second call returns `alreadyRecorded` with the first call's numbers (Review Focus 2).
  - `a new count supersedes an older open one`: the first count's status becomes `dismissed` and its follow-up resolves as `"superseded"`.
  - `a count over expected says more`: counted 310000 gives the question with `৳100 more`.
  - A `reconciliation-contract.ts` case: `recordCount` with an existing id returns `exists` and writes no second follow-up.
- [ ] **Step 2:** Run `pnpm vitest run packages/application`. Expected: FAIL.
- [ ] **Step 3:** Implement the port, the in-memory and Firestore repositories (`recordCount` in one `runTransaction`), `list`, and `RecordCashCount`. Supersede older counts after a successful `created`.
- [ ] **Step 4:** Run `pnpm vitest run packages/application` and `pnpm test:emulator:core`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: record a cash count without changing balances (gate 32)`.

### Task 4: Adjust to the count

**Files:**
- Create: `packages/application/src/use-cases/record-cash-adjustment.ts`
- Test: `packages/application/src/use-cases/record-cash-adjustment.test.ts`

**Interfaces:**
- Consumes: `ReconciliationRepository` (Task 3), `PostTransaction`, `FollowUpRepository`, `AccountRepository`, `Clock`.
- Produces: `class RecordCashAdjustment { execute({ ownerId, reconciliationId, cause }): Promise<recordAdjustmentResponse shape> }`.

- [ ] **Step 1: Write the failing tests:**
  - `adjusting a short count posts a decrease to Cash, not spending`: after the −70000 count from Task 3, `cash-main` = 80000 and adjustment equity is +70000. The transaction has `intentType "adjustment"`, `auditDetails.cause`, and `authorizedBy` = the owner. No expense entries exist. The count is `adjusted` with `adjustmentTransactionIds: ["txn-adjust-recon-k1"]`, the follow-up is resolved, and the response has `countedMinor` 230000 and `adjustmentMinor` 70000.
  - `adjusting an over count posts an increase`.
  - `a repeat returns alreadyRecorded and posts once`.
  - `a superseded count cannot be adjusted`: the error is `invalidTransition` and no transaction is posted (Review Focus 3).
  - `a matching count cannot be adjusted`: `invalidTransition`.
  - `a blank cause is refused`: `invalidIntent`.
  - `another owner's count is not found`: `resourceNotFound`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement.** Post first (the key makes it idempotent). Then `markStatus("adjusted")`, then `followUps.resolve(fu-<id>, "adjusted")`. If the count is already `adjusted` and the transaction exists, return `alreadyRecorded`.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit `feat: adjust cash to a count, with reason and audit`.

### Task 5: Split a paired transfer

**Files:**
- Create: `packages/application/src/use-cases/split-transfer.ts`
- Modify: `packages/application/src/use-cases/correct-transaction.ts` (export `withAmount` as `rebuildIntent`), `packages/application/src/ports/source-event-repository.ts`, `packages/application/src/testing/in-memory-source-events.ts`, `packages/infrastructure/src/firestore/firestore-source-event-repository.ts`, `packages/application/src/testing/source-event-contract.ts`
- Test: `packages/application/src/use-cases/split-transfer.test.ts`. Build the pair by running the real pipeline twice on a UCB debit and a bKash credit of ৳1,700, the way the pairing tests in `advance-source-event.test.ts` do.

**Interfaces:**
- Consumes: `ReverseAndReplace` with `alsoPost` (Task 2), `candidateToIntent`, `accountRef` (from `pipeline/stages/deps.ts`), `rebuildIntent(tx, entries, amount)`.
- Produces:
  - `SourceEventRepository.markTransferSplit(ownerId, id, transactionId: string, nowMs): Promise<"applied" | "stale">`. It applies only when the event is `posted` with `matchKind "transferCounterpart"`. It returns `applied` without writing when the event already carries `matchedTransactionId === transactionId` and `matchKind "none"`.
  - `class SplitTransfer { execute({ ownerId, sourceEventId }): Promise<splitTransferResponse shape> }`.

- [ ] **Step 1: Write the failing tests:**
  - `splitting counts the two SMS as Spent and Came in again`:
    - `txn-A:repl` is `reversed`.
    - `txn-A:repl:repl` is a `purchase` on UCB with the original category.
    - `txn-<B>` is an `income` on bKash with `sourceEventIds [B]`.
    - Each balance equals what it was before pairing, and every transaction balances.
    - Event B has `matchKind "none"` and `matchedTransactionId "txn-<B>"`.
    - `toRecentItems` now lists two items, neither with a `Transfer` chip.
  - `pairing credit-first then splitting works the same` (the spent half is the replacement).
  - `a second split returns alreadyRecorded and changes nothing` (Review Focus 4).
  - `a split interrupted after the ledger write finishes on retry`: run the ledger step, make `markTransferSplit` throw once, then call again. The result is `alreadyRecorded`, the event is updated, and the ledger has exactly one reversal.
  - `a transfer the user already corrected cannot be split`: correct `txn-A:repl` first. The error is `invalidTransition`, and the ledger and event are unchanged (Review Focus 5).
  - `an event that is not a paired transfer is refused`: `invalidTransition`.
  - A `source-event-contract.ts` case: `markTransferSplit` on a non-transfer event returns `stale`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement.** Read B, then `txn-A:repl`, then the reversed `txn-A` and its entries, and rebuild A's intent at the same amount. B's intent is `candidateToIntent(B.candidate, { source: <B's account ref>, destination: null, systemCash: <as the post stage resolves it> })`, with `occurredAtMs` = `B.candidate.occurredAtMs ?? B.receivedAtMs`. Call `ReverseAndReplace` with `actor` = the owner. Then call `markTransferSplit`. When the event already shows as split, skip straight to the response. Assign spent and came-in by which intent is the `purchase`.
- [ ] **Step 4:** Run `pnpm vitest run packages/application` and `pnpm test:emulator:core`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: split a wrongly paired transfer back into Spent and Came in`.

### Task 6: Callables

**Files:**
- Create: `apps/functions/src/callable/cash-commands.ts` (`recordReconciliation`, `recordAdjustment`, `splitTransfer`)
- Modify: `apps/functions/src/composition.ts`, `apps/functions/src/index.ts`
- Test: `apps/functions/test/callable-auth.emulator.test.ts` and `apps/functions/test/cross-user.emulator.test.ts`, extended for the three callables

- [ ] **Step 1: Write the failing emulator tests.** Each callable refuses unauthenticated callers and callers outside the allowlist. Owner B can neither adjust owner A's count nor split owner A's event (`not-found`). An owner records a count, sees the follow-up in Firestore, adjusts, and sees `cash-main` drop.
- [ ] **Step 2:** Run `pnpm test:emulator:functions`. Expected: FAIL.
- [ ] **Step 3:** Wire the three use cases through `createCallable`, following `follow-up-commands.ts`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat: callables for cash count, adjustment and transfer split`.

### Task 7: Web, the cash count

**Files:**
- Create: `apps/web/src/features/chat/CashCountCard.tsx` (frame I1 input → I2 gap or match), `apps/web/src/features/chat/CashGapActions.tsx` (the three actions and the I3 adjust form; shared by the card and the stored follow-up)
- Modify: `apps/web/src/shared/parse-bdt-input.ts` (`options?: { allowZero?: boolean }`), `apps/web/src/shared/copy.ts`, `apps/web/src/features/chat/ChatScreen.tsx` (quick-action row, `startWith?: "cashCount"` prop, hide the follow-up whose id matches the card's `followUpId`, render `reconciliationDifference` follow-ups with `CashGapActions` instead of `QuestionCard`), `apps/web/src/features/chat/ChatLauncher.tsx` (wrap children; export `useChatOpener(): { openChat(start?: "cashCount"): void } | null`), `apps/web/src/features/shell/AppShell.tsx`, `apps/web/src/features/dashboard/DashboardScreen.tsx` (a `Count my cash` button in the unexplained box, shown only when `useChatOpener()` isn't null), `chat.module.css`, `dashboard.module.css`
- Test: `parse-bdt-input.test.ts`, `ChatScreen.test.tsx`, `ChatLauncher.test.tsx`, `DashboardScreen.test.tsx`

- [ ] **Step 1: Write the failing tests:**
  - `parseBdtInput("0", { allowZero: true }) === 0`, `parseBdtInput("0") === null`, and `parseBdtInput("2,300.50", { allowZero: true }) === 230050`.
  - ChatScreen:
    - `Count my cash` shows the card. Typing `2,300` and pressing Check calls `recordReconciliation` with `countedMinor: 230000`.
    - With a mocked response of difference −70000, the card shows `৳700 isn't accounted for`, every breakdown row and the gap note.
    - Two clicks on Check while it's busy make one call. A retry after a rejection reuses the same `idempotencyKey` (Review Focus 2).
    - Counting `0` is sent (Review Focus 1). Bad input such as `abc` shows an alert and makes no call.
    - Adjust with an empty reason doesn't submit. With `maybe lost`, it calls `recordAdjustment({ reconciliationId, cause: "maybe lost" })` and shows the adjusted copy.
    - `Leave it open` collapses the actions and calls nothing.
    - `Tell me what it was for` focuses the composer with the example placeholder.
    - A stored `reconciliationDifference` follow-up renders the three actions. Without `targetReconciliationId`, the Adjust button is hidden.
    - A matching response shows the match copy.
    - In demo mode, a rejection shows `COPY.demoUnavailable`.
    - axe passes on the card, the gap and the adjust form.
  - ChatLauncher: `openChat("cashCount")` opens the panel on the card.
  - DashboardScreen: the unexplained box has a `Count my cash` button that calls `openChat("cashCount")`.
- [ ] **Step 2:** Run `pnpm --filter web vitest run`. Expected: FAIL.
- [ ] **Step 3:** Implement it, matching mockup frames I1–I3 and the copy in Global Constraints.
- [ ] **Step 4:** Run `pnpm --filter web vitest run` and `pnpm verify`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): count my cash, gap card and adjust form`.

### Task 8: Web, "Not a transfer?"

**Files:**
- Create: `apps/web/src/features/chat/SplitTransferPanel.tsx`
- Modify: `apps/web/src/features/chat/EvidenceBubble.tsx` (show the button when `event.matchKind === "transferCounterpart"` and the outcome is `recorded`; add `splitTransfer` to the commands pick), `ChatScreen.tsx` (`ChatCommands` pick), `copy.ts`, `chat.module.css`
- Test: `ChatScreen.test.tsx`

- [ ] **Step 1: Write the failing tests:**
  - A posted transfer event with a UCB card debit paired to a bKash credit shows `Not a transfer?`. Clicking it shows `Spent, from UCB card ••7777 ৳1,700` and `Came in, to bKash ৳1,700`; the debit side is the spent side, as in the chip logic of `recent-items.ts`.
  - `Keep as transfer` closes it with no call.
  - `Yes, count separately` calls `splitTransfer({ sourceEventId })` once, even on a double click, and shows the done copy.
  - A rejection shows an alert and claims nothing.
  - A non-transfer event has no button.
  - axe passes.
- [ ] **Step 2:** Run `pnpm --filter web vitest run`. Expected: FAIL.
- [ ] **Step 3:** Implement it, matching mockup frame I4.
- [ ] **Step 4:** Run `pnpm --filter web vitest run` and `pnpm verify`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): not a transfer undo`.

### Task 9: End-to-end tests, final checks and records

**Files:**
- Modify: the emulator Playwright smoke spec under `e2e/` (count → gap → adjust; this needs `cash-main` > 0, so seed by pasting a cash note or withdrawal SMS the fake AI handles), the fixture spec under `e2e/fixture/` (`Count my cash` opens the card; Check shows the demo-unavailable copy)
- Modify: `docs/release/release-checklist.md` (gate 32 now has a feature and tests; the transfer undo is done), the `sources-from-sms` spec §9 (the undo shipped), `AGENT.md` project status (one line), `docs/superpowers/progress/cash-count-undo.md`

- [ ] **Step 1:** Write both e2e paths. Run `pnpm test:e2e` and `pnpm test:e2e:fixture`. Expected: both PASS.
- [ ] **Step 2: Full verification.** Run `pnpm verify`, `pnpm --filter web build`, `pnpm test:emulator`, `pnpm test:e2e` and `pnpm test:e2e:fixture`. Record the real counts in the progress file.
- [ ] **Step 3:** Update the records listed above. Commit `docs: cash count and transfer undo done`.
- [ ] **Step 4:** Run the whole-branch review (superpowers:requesting-code-review). Fix Critical and Important findings test-first, then hand integration to Mabrur.
