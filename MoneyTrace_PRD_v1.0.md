Product Requirements Document \| Version 1.0 \| 06 November 2026

Status: Locked MVP baseline, amended 2026-11-07 by CR-001 (OCR and receipts deferred) and CR-002 (Phase 0 exit split); see section 19. Implementation is in progress. “Locked” denotes agreed product scope and technology direction, subject to change control for security, feasibility, and measured OCR/model performance.

# 1. Executive summary

MoneyTrace is a single-user, mobile-first progressive web application (PWA) for evidence-driven personal and household financial tracking. Instead of manual bookkeeping, the user pastes bank SMS text, uploads receipts/screenshots/PDFs, or describes cash activity conversationally. The system extracts and interprets financial evidence, deduplicates events, validates and posts balanced accounting entries, and asks focused questions about missing information. A hybrid home screen displays financial summary, unresolved items, and an always-available AI chat.

# 2. Problem, target user, and goals

Problem: Spending across bank accounts, debit and credit cards, and shared physical cash is difficult to reconstruct; ATM withdrawals and card repayments are often misclassified as spending, and receipt/SMS duplicates distort reports.

Primary persona: Individual managing several accounts and cards, personal and household cash, and family-held money; willing to spend approximately 2–5 minutes per day reviewing exceptions, not entering forms.

| Goal                   | Measurable MVP outcome                                                                                |
|------------------------|-------------------------------------------------------------------------------------------------------|
| Minimal manual entry   | Bank SMS and readable receipts can be submitted by paste/upload; routine cases do not require a form. |
| Accounting correctness | Withdrawal, transfer, credit-card purchase and repayment flows pass invariant tests.                  |
| Explain spending       | Monthly expense categories and unexplained balance differences are separately visible.                |
| Proactive follow-up    | Unresolved withdrawal destination and cash reconciliation tasks generate scheduled reminders.         |
| Privacy                | Temporary receipt originals deleted promptly after validated structured record is persisted.          |

# 3. Locked decisions and assumptions

| Area        | MVP decision                                                                                             |
|-------------|----------------------------------------------------------------------------------------------------------|
| Experience  | Hybrid dashboard + AI chat, mobile-first PWA; conversation is the default input.                         |
| User access | Single user; family member names and cash custody supported, family login deferred.                      |
| Frontend    | Next.js + TypeScript.                                                                                    |
| Backend     | Firebase Authentication, Cloud Functions (TypeScript), Cloud Firestore.                                  |
| AI          | DeepSeek API initially behind an AIProvider interface; no custom model training.                         |
| OCR         | Deferred by CR-001. When resumed: replaceable OCR adapter; benchmark local Tesseract.js and managed OCR against actual receipts. |
| Uploads     | Deferred by CR-001. When resumed: private temporary Cloud Storage; delete original after successful OCR, validation, and durable save. |
| Reminders   | Scheduled backend jobs plus supported web push/FCM; user controls cadence.                               |
| Currency    | BDT first; integer minor units / exact arithmetic.                                                       |
| AI budget   | Configurable target initially USD 5/month for model API only; not a guaranteed all-in bill.              |
| Onboarding  | Hybrid cutover: begin with dated opening balances; historical imports later with cutover reconciliation. |

# 4. Information architecture and screens

| Screen                     | Primary elements / actions                                                                                                                               |
|----------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| 01 — Home                  | Available bank + cash, spending this period, card liabilities, pending follow-ups, chat composer, upload action; freshness/verification labels.          |
| 02 — AI Chat               | Paste SMS or narrative, upload receipt/screenshot/PDF, show extracted transaction preview, clarifying questions, correction commands, processing status. |
| 03 — Activity / Inbox      | Chronological ledger activity, source evidence status, duplicate matches, provisional vs posted, filters, correction/reversal actions.                   |
| 04 — Accounts & Cash       | Bank accounts, cash wallets, credit-card liabilities, linked debit instruments, family-held cash, allocations, reconciliation and adjustments.           |
| 05 — Reports               | Calendar-month and configurable salary-cycle views; income, expenses, category trends, account movements, outstanding cards, discrepancies.              |
| 06 — Settings / Onboarding | Account creation, opening balances, AI budget, reminder preferences, data export/deletion, privacy, notification settings.                               |

# 5. Key user journeys

## 5.1 First-time setup

1.  Sign in and establish user identity; select BDT and reporting period preference.

2.  Add bank accounts, credit cards, cash wallets and masked payment instruments.

3.  Record effective-dated opening balances and current credit-card liabilities; mark them as opening positions, not income/expenses.

4.  Configure reminder cadence and optional push permissions.

5.  Paste first bank SMS or upload receipt; review the resulting transaction or clarification.

## 5.2 SMS to posted transaction

6.  User pastes raw SMS into chat; system stores a source event with idempotency key.

7.  Deterministic parser attempts extraction; AI fallback returns schema-constrained candidate.

8.  System resolves known account mapping and searches for duplicate or related events.

9.  Backend validates amount, currency, account and ledger invariants; high-certainty events post, ambiguous events wait for clarification.

10. Chat acknowledges actual state (recorded, pending, or failed), never an unconfirmed success.

## 5.3 ATM withdrawal and cash follow-up

11. Identify withdrawal as bank-to-cash transfer, not expense.

12. Confirm or infer with evidence the destination wallet; if unknown, post to a system wallet labelled as cash with no place set, and ask (CR-004).

13. Track wallet balances, family-held cash transfers, and subsequent purchases without treating cash custody as spending.

14. At configured times, create non-repetitive follow-ups for unresolved destination or reconciliation gaps.

15. User replies naturally; backend posts validated transactions and closes or snoozes follow-ups.

## 5.4 Receipt upload, OCR, and deletion (deferred by CR-001)

16. User uploads supported image/PDF into a private, short-lived staging location; restrict size and MIME type.

17. OCR extracts raw text; AI/heuristics parse merchant, timestamp, total, tax, line items and payment clues.

18. Validate monetary totals, extraction quality, and duplicate/matching candidates; persist structured evidence and review state.

19. Delete original image promptly after confirmed durable save, whether transaction is posted or explicitly awaiting clarification with sufficient extracted evidence.

20. If extraction/validation fails, do not label successful; allow retry/cancel and enforce an automatic cleanup deadline for abandoned files.

## 5.5 Corrections and reconciliation

21. User says “That was paid by card, not cash” or corrects amount.

22. System identifies affected posting, displays proposed correction if materially consequential, and posts reversal/replacement atomically.

23. Original source, rationale and actor remain in audit trail.

24. Bank, card and cash reconciliations compare counted/statement balances to ledger; differences stay explicit until resolved.

# 6. Functional requirements (prioritized)

| ID    | Priority | Requirement                                                                                                                            |
|-------|----------|----------------------------------------------------------------------------------------------------------------------------------------|
| FR-01 | P0       | Authenticate user and isolate all data by ownership.                                                                                   |
| FR-02 | P0       | Manage bank accounts, cash wallets, credit-card liabilities and debit-card instrument mappings.                                        |
| FR-03 | P0       | Create dated opening balances without booking them as income/expense.                                                                  |
| FR-04 | P0       | Accept SMS/chat text; preserve source event and parsing status.                                                                        |
| FR-05 | P0       | Provide replaceable AI provider for structured interpretation and conversational clarification.                                        |
| FR-06 | Deferred (CR-001) | Process receipt image/screenshot/PDF via OCR adapter and structured validation.                                                        |
| FR-07 | Deferred (CR-001) | Delete original receipt from active temporary storage after successful validation and persistence; cleanup failures/abandoned uploads. |
| FR-08 | P0       | Deduplicate across SMS, receipts, email text and future statement imports; do not merge distinct same-value purchases.                 |
| FR-09 | P0       | Post balanced, atomic, idempotent ledger entries; preserve immutable audit and corrections.                                            |
| FR-10 | P0       | Handle withdrawals, transfers, card purchases, card payments, partial repayments, fees, refunds and adjustments correctly.             |
| FR-11 | P0       | Track cash wallets, intended allocations, family-held custody and actual spending separately.                                          |
| FR-12 | P0       | Generate follow-up queue, schedule reminders, snooze and resolve; enforce anti-spam policy.                                            |
| FR-13 | P0       | Provide hybrid home summary and clear pending/verified states.                                                                         |
| FR-14 | P0       | Enforce AI usage metering, quotas, retries and graceful non-AI fallback.                                                               |
| FR-15 | P1       | Provide transaction inbox and cash/bank/card reconciliation views.                                                                     |
| FR-16 | P1       | Report monthly and salary-cycle income, expense, card liabilities and discrepancies.                                                   |
| FR-17 | P1       | Export financial records and support user-requested deletion.                                                                          |
| FR-18 | P1       | CSV import with mapping/preview and historical cutover reconciliation.                                                                 |
| FR-19 | Later    | Automatic inbox SMS collection, authorized email sync, family login, bank API sync, investments.                                       |

# 7. Accounting and financial invariants

- A cash withdrawal decreases bank assets and increases cash assets; it is never an expense by itself.

- Cash allocation or money given to a family member for future spending changes custody/allocation, not expense recognition.

- A credit-card purchase records an expense and increases a liability; repayment reduces bank assets and liability, not expense.

- Debit cards are instruments attached to underlying bank accounts, not separate balance-bearing accounts.

- Card interest/fees are expenses; refunds reverse relevant expense/liability or asset effects.

- Every posted financial transaction must have balanced ledger entries in the same currency, with immutable history.

- A physical cash discrepancy is not automatically categorized as spending; adjustments require explicit cause, authorization and audit.

- Pending authorizations and final posted transactions must not be counted twice.

- Opening-balance cutover and later historical imports must not duplicate historical activity.

# 8. AI and OCR design

AIProvider contract: interpretEvidence(normalizedText, context) → validated candidate(s); respond(messages, authorizedFinancialContext) → assistant text + proposed approved actions. Adapter isolates DeepSeek-specific authentication, model names, JSON/schema handling, token metering, timeouts and retries. AI never receives unrestricted database access and cannot directly mutate ledger balances.

OCRProvider contract: extract(document, localeHints) → extracted text, positions when available, quality diagnostics and provider metadata. Evaluate Tesseract.js (local) and a managed OCR fallback using representative Bangladesh receipts: Bangla/English, thermal paper, photographs, screenshots and PDFs. OCR does not determine accounting truth; deterministic validations and matching do.

Use schema validation, exact arithmetic, source-event IDs, model/prompt version metadata and a regression test corpus. Known bank SMS patterns should be parsed deterministically before invoking AI; unclear cases are explicitly marked for review. Do not assume DeepSeek’s text API can process raw images: use OCR first.

# 9. Data model (conceptual)

| Entity            | Key fields / relationships                                                                        |
|-------------------|---------------------------------------------------------------------------------------------------|
| User              | Identity, preferences, reporting cycle, notification and privacy settings.                        |
| Account           | Type: bank, cash, family-held cash, credit liability; currency; status; opening position.         |
| PaymentInstrument | Masked identifier; debit instrument links to bank account; credit instrument links to liability.  |
| SourceEvent       | Raw or minimized extracted text, source type, timestamps, hash, provenance, processing status.    |
| Transaction       | Canonical financial event, amount, currency, category, date, lifecycle state, matched source IDs. |
| LedgerEntry       | Transaction ID, account ID, debit/credit side, exact amount; append-only.                         |
| CashAllocation    | Wallet, intended purpose, remaining allocation, history; not a spend.                             |
| Reconciliation    | Account, statement/count, expected balance, difference, review status, adjustment references.     |
| FollowUp          | Trigger, target transaction/wallet, question, due time, snooze, resolution state.                 |
| Conversation      | Messages, references to evidence and approved operations; retention policy.                       |
| AIUsage           | Provider/model, tokens, estimated/actual cost, request status and timestamps.                     |
| TemporaryUpload   | Owner, upload path, processing state, expiry and deletion verification.                           |

# 10. Security, privacy and retention

- Firebase Authentication plus ownership checks on every request; strict Firestore/Storage rules; App Check as supplemental abuse protection, not authorization.

- Cloud Functions mediate all ledger writes and third-party API calls; store credentials in Secret Manager.

- Minimize/redact sensitive card/account data and never request/store bank passwords, PINs or OTPs.

- Receipt original deletion occurs after durable structured persistence; verify deletion operation and retry failures.

- Configure object versioning/soft-delete and provider-side retention deliberately; deletion from active storage is not guaranteed deletion of external copies or backups.

- Retain extracted financial evidence and audit history per disclosed policy, with export and deletion controls.

- Use structured logs without raw financial documents or secrets; implement backups and restore testing.

- Ensure third-party AI/OCR data-processing terms are reviewed before sending personal financial data.

# 11. Notifications and follow-up rules

Scheduled job identifies unresolved withdrawal destinations, unreviewed cash activity, and reconciliation differences. Default suggested cadence: one evening digest; user-adjustable time, frequency, minimum threshold and quiet hours. Reminders must be idempotent, snoozable, non-duplicative, and stateful. Push requires user permission and platform support; an in-app inbox is the reliable fallback. Reminder wording must not imply that unaccounted cash was necessarily spent.

# 12. Costs and failure behavior

Initial AI target: USD 5/month for model API usage only. Actual pricing and API billing are provider-specific and must be verified before launch; consumer chat subscriptions are not equivalent to API credits. Meter input/output tokens, estimated cost and actual usage. Enforce app-side per-request, daily and monthly quotas with conservative reservation and reconciliation; also configure available provider limits/alerts. Firestore, Functions, Storage, OCR, egress and notification infrastructure are separately budgeted.

When AI quota is exhausted or provider unavailable: ledger, balances, reports and reminders remain operational; deterministic SMS parsers continue; ambiguous evidence enters a visible queued/pending state. Do not silently drop uploads or claim posting succeeded. Apply rate limits and bounded retries with backoff.

# 13. Nonfunctional requirements

| Area           | Acceptance target                                                                                     |
|----------------|-------------------------------------------------------------------------------------------------------|
| Integrity      | All postings atomic, balanced, idempotent; retry-safe; exact monetary arithmetic.                     |
| Security       | Cross-user access blocked by rules and backend authorization; no client API secrets.                  |
| Responsiveness | User sees immediate upload/chat acknowledgment; slower OCR/AI runs asynchronously with status.        |
| Observability  | Correlated request IDs, job statuses, costs, errors and deletion confirmation; no sensitive raw logs. |
| Resilience     | Retries, dead-letter/review state, scheduled cleanup and tested backup/restore.                       |
| Accessibility  | Keyboard-accessible chat, clear status text, sufficient contrast, mobile touch targets.               |
| Privacy        | Ephemeral receipt originals; documented third-party and backup retention limitations.                 |

# 14. Acceptance tests / release gates

25. Given a bank withdrawal SMS, bank decreases and cash increases without expense recognition.

26. Given a card purchase and partial repayment, spending appears once and liability reduces by payment amount.

27. Deferred by CR-001. Given matching SMS plus receipt, exactly one canonical expense is posted and both sources are linked.

28. Given two distinct equal-value purchases, deduplication does not incorrectly collapse them.

29. Deferred by CR-001. Given unreadable receipt, system requests retry and does not mark extraction successful or post guessed amount.

30. Deferred by CR-001. Given valid receipt, structured evidence persists and temporary original deletion is confirmed or retried.

31. Given unresolved cash custody, follow-up appears at scheduled time and stops when resolved/snoozed.

32. Given cash count differing from ledger, discrepancy is visible without silent balance adjustment.

33. Given an edited transaction, reversal/replacement retains original evidence and audit trail.

34. Given AI budget exhausted, non-AI features continue and pending evidence is not lost.

35. Given another user identity, all private financial data and uploads are inaccessible.

36. Given later historical import, cutover rules prevent duplicate opening balance effects.

# 15. Scope boundaries

Included: one-user onboarding, bank/cash/card accounts, text evidence, AI interpretation, canonical ledger, cash follow-ups, hybrid home, inbox, basic reporting, privacy/security, exports and controlled imports as prioritized above.

Deferred: OCR receipt upload (CR-001), automatic Android SMS access, continuous email monitoring, live bank integrations, family sign-in and permissions, investments, advanced budgeting, predictive financial advice, tax filing and merchant payment integrations.

# 16. Delivery phases and dependencies

| Phase                            | Outcome                                                                          | Exit gate                                               |
|----------------------------------|----------------------------------------------------------------------------------|---------------------------------------------------------|
| 0A — Local foundations (CR-002)  | Auth, rules, ledger invariants and cost metering, verified on emulators. | Security and accounting tests green locally; task reviews and whole-branch review complete. |
| 0B — Deployment gate (CR-002)    | Real Firebase projects, Blaze, deployed Functions, App Check, rate limits, spending controls, backups, CI. | All controls in the environments runbook met; Delhi trigger and schedule smoke test passed; first restore drill matched. Required before any deployment or real financial data. |
| 1 — SMS vertical slice           | Chat → parser/AI → candidate → posting → cash follow-up → dashboard.             | ATM and card workflows correct end-to-end.              |
| 2 — Receipt pipeline (deferred by CR-001) | Private upload → OCR → extraction → matching → persistence → deletion. | Real sample accuracy benchmark and deletion tests pass. |
| 3 — Reconciliation and reporting | Cash counts, card partial payments, inbox, monthly/salary-cycle reports.         | Reconciliation and duplicate tests pass.                |
| 4 — Hardening / pilot            | Budget limits, retries, observability, exports, accessibility, user pilot (after 0B). | All release gates in scope met.                         |

# 17. Risks, mitigations, and decisions to validate

| Risk / open validation                     | Mitigation                                                                                                                      |
|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| OCR accuracy on Bangla/thermal receipts    | Benchmark representative samples; fallback provider; explicit uncertainty handling.                                             |
| Firestore accounting complexity            | Backend-only balanced postings, immutable entries, transaction tests; revisit storage choice if invariants or query needs fail. |
| Provider pricing or model behavior changes | Adapter, versioned prompts, usage ceilings, regression suite; verify current pricing.                                           |
| Immediate deletion vs correction ability   | Preserve validated extracted text and fields; allow retry before deletion; disclose loss of original visual evidence.           |
| PWA push reliability across devices        | In-app reminders as baseline; opt-in push and platform-specific testing.                                                        |
| Opening balances vs historical imports     | Explicit cutover timestamps and import reconciliation rules.                                                                    |
| Unspecified report period                  | Support calendar month; configure salary-cycle anchor during onboarding.                                                        |
| User-facing reminder defaults              | Start with conservative evening digest; validate through pilot.                                                                 |

# 18. Definition of done and change control

MVP is ready only when every in-scope P0 requirement and release gate is satisfied, the 0B deployment gate is passed, security/privacy review is completed, and accounting invariants are regression-tested. Receipt deletion/cleanup behavior must be verified when receipts return (CR-001). Any change to the locked baseline should record the proposed change, rationale, security/cost impact, and acceptance criteria. P1 work may be phased after the first functioning vertical slice, but must not undermine ledger correctness.

Document owner: MoneyTrace product initiative.

# 19. Change log

## CR-001: Defer OCR and receipt processing (2026-11-07)

Status: Accepted by Mabrur (recorded in commit `bc3e44c`).

| Field | Record |
|---|---|
| Proposed change | Move OCR and receipt processing out of the current P0/P1 scope. FR-06 and FR-07 change from P0 to Deferred. Journey 5.4, delivery phase 2 and release gates 27, 29 and 30 are deferred with them. No local or managed OCR provider, receipt upload flow, OCR benchmark or Storage dependency is built for now. |
| Rationale | Keep the current product path focused on authenticated ledger workflows and SMS/text evidence. |
| Security impact | Reduces exposure: no receipt images or PDFs are stored, and none are sent to an OCR provider. The upload rules, contracts and provider interfaces stay in the repository but no product flow uses them. The original-deletion and provider-retention requirements in sections 8, 10 and 13 apply again when receipts return. |
| Cost impact | Removes OCR, Storage and related egress cost for now. The AI budget is unchanged. |
| User impact | Evidence can be pasted or typed only. The upload actions on Home and AI Chat are not offered, and the "readable receipts" part of the minimal-entry goal is not met until this is reversed. |
| Acceptance criteria | No current-phase code path requires an OCR provider or Storage. FR-08 deduplication is tested across text sources, and gate 28 still applies. Before OCR returns, FR-06, FR-07, journey 5.4 and gates 27, 29 and 30 are restored to scope through a new change record, and the bearer download-token issue noted in the scope table of `docs/superpowers/plans/2026-11-06-phase-0-foundations.md` is settled. |

Text in this document that describes receipts, OCR or uploads is kept as the design for that later work.

## CR-002: Split Phase 0 exit; stay on the Spark plan until the deployment gate (2026-11-07)

Status: Accepted by Mabrur (Spark decision recorded in commit `f24b098`; split requested 2026-11-07).

| Field | Record |
|---|---|
| Proposed change | Split phase 0 into 0A, local foundations verified on emulators, and 0B, a deployment gate. Real Firebase projects, Blaze, deployed Functions, backups, the restore drill and CI move to 0B. |
| Rationale | Those items need Blaze, and Blaze is pay-as-you-go with no built-in stop, so it waits until abuse and spending controls exist. Local work does not need it. |
| Security impact | Nothing is reachable from the internet until App Check, rate limits, least-privilege access and an abuse checklist are in place. App Check moves earlier, from phase 4 to 0B. Until 0B passes, no real financial data may enter the system, including through the real AI API. |
| Cost impact | No Firebase bill before 0B. Backups and the first restore drill are postponed, so no real data may exist until they pass. |
| Delivery impact | Phase 1 may start after 0A and runs on emulators. The Delhi region remains unproven for triggers and schedules until the 0B smoke test, and the Firestore location is permanent, so no dev or prod database is created before it passes. Phase 4 cannot begin its user pilot before 0B passes. |
| Acceptance criteria | The 0A and 0B exit gates in section 16. The full 0B control list is in `docs/runbooks/firebase-environments.md`. |

## CR-003: Start Phase 1 before the 0A reviews finish (2026-11-07)

Status: Accepted by Mabrur on 2026-11-07. Reviews completed 2026-11-12: Task 12 callables, web sign-in, restore drill tooling and the Phase 0 whole-branch review all ran; their critical and important findings are fixed (`docs/superpowers/progress/cr-003-reviews.md`), and the sign-in hardening findings are 0B gate items in `docs/runbooks/firebase-environments.md`.

| Field | Record |
|---|---|
| Proposed change | Phase 1 starts without the 0A gate's task-review and whole-branch-review item. The Task 12 review, and review of the web sign-in and restore drill tooling, have not completed. All other 0A items stand. |
| Rationale | Mabrur's decision to keep delivery moving. |
| Security impact | The callables are the security boundary and have had no completed independent review. Their tests pass, but defects a review would catch may remain. CR-002 still bars deployment and real financial data until 0B. |
| Cost impact | Saves review usage now. Defects found later cost more to fix once Phase 1 builds on them. |
| Acceptance criteria | The outstanding reviews are completed no later than the Phase 1 exit, and before 0B. |

## CR-004: Post withdrawals at once to a system wallet (2026-11-07)

Status: Accepted by Mabrur on 2026-11-07, with the Phase 1 plan.

| Field | Record |
|---|---|
| Proposed change | A withdrawal SMS posts immediately as bank to a system cash wallet, `Cash · place not set`, then asks where the cash went. Journey 5.3 step 12 previously said to keep it pending. |
| Rationale | The bank has already been debited, so a pending state would show a wrong bank balance until answered. The design mockup shows "Recorded" followed by the question. |
| Security impact | None. |
| Cost impact | None. |
| Acceptance criteria | Gate 25, with the Home summary showing the amount as not yet explained and never as spending. |

## CR-005: Build all UI before further functionality (2026-11-11)

Status: Accepted by Mabrur on 2026-11-11.

| Field | Record |
|---|---|
| Proposed change | Before Phase 3 or 0B work, build every section 4 screen plus the reminders inbox in `apps/web`. Screens without a backend use typed fixture data behind a build-time flag. No backend, contract or rules changes are made during this work. CR-003's review deadline moves from Phase 1 exit to "before functionality work resumes", and still applies before 0B. Spec: `docs/superpowers/specs/2026-11-11-ui-screens-design.md`. |
| Rationale | Mabrur wants to see and validate the whole product's UI before investing in more functionality. |
| Security impact | Fixture mode skips sign-in, so it is allowed only when the Firebase project ID starts with `demo-`, and the build fails otherwise. Fixture actions never report success. The CR-003 callable reviews are delayed further, but CR-002 still bars deployment and real data. |
| Cost impact | None. No backend or AI usage. |
| Acceptance criteria | Every screen group in the spec has an approved mockup and a built screen with component tests. The fixture-mode smoke test passes. `pnpm verify` and `pnpm --filter web build` pass. |

## CR-006: Accounts start blank, at ৳0 (2026-11-12)

Status: Accepted by Mabrur on 2026-11-12.

| Field | Record |
|---|---|
| Proposed change | An account is created with only a name and a type. The UI asks for no bank, no card or account digits, and no payment instruments, and has no opening-balance step. Every account starts at ৳0, and its balance comes only from activity recorded in MoneyTrace. This narrows FR-02 (no instrument mappings in the UI), FR-03 (no opening balances offered), journey steps 2–3, the onboarding row in section 2 and screen 06. The backend commands for instruments and opening balances stay, with no contract change, but nothing in the UI calls them. Gate 36 has nothing to protect until historical imports exist. |
| Rationale | Mabrur wants setup to start blank, without entering any bank or card details. |
| Security impact | Positive: no account or card identifiers are collected or stored. |
| Cost impact | None. A bank SMS whose account can't be identified waits for the user's answer; it costs no AI usage. |
| Delivery impact | Without digits an SMS can't be matched to an account, so every pasted bank SMS asks "Which account?". Nothing remembers the answer; remembering it per bank would be a separate feature. Balances show only movement since setup, so a bank account can go below ৳0 (an ATM withdrawal with no income recorded yet shows the bank at −৳4,000), and "Available" is not the real bank balance until income has been recorded. |
| Acceptance criteria | Setup and Add account ask only for a name and a type. No digits, bank picker or opening-balance field appears anywhere in the UI. Component tests cover both forms; `pnpm verify`, the fixture smoke test and the emulator E2E pass. |

## CR-007: One dashboard with a pop-up chat (2026-11-12)

Status: Accepted by Mabrur on 2026-11-12. Spec: `docs/superpowers/specs/2026-11-12-dashboard-chat-design.md` (piece 1 of 4).

| Field | Record |
|---|---|
| Proposed change | After Google sign-in the app is one dashboard: this month's spending, income and unexplained cash, spending by category with a month-to-month comparison, money now, recent transactions, and (piece 3) tips. A button pops up the chat, where the user pastes SMS or describes spending; the chat's questions replace the reminders inbox. Section 4's separate screens (Activity/Inbox, Accounts & Cash, Reports, Settings/Onboarding) are removed from the UI; sign-out and the AI budget move to a dashboard menu. Accounts are created automatically from SMS (piece 2), keeping only the last digits the SMS shows; this narrows CR-006, under which no details are *entered*. Tips come from DeepSeek using category totals only (piece 3). |
| Rationale | Mabrur's product description of 2026-11-12: sign in, a blank or populated dashboard, a chat that turns any pasted transaction into figures, graphs of where the money went, and tips to spend less. |
| Kept unchanged | The ledger and every accounting invariant; deterministic parsers before AI; AI proposes and the backend validates and posts; honest status; metering and quotas; CR-002 (no real data or real DeepSeek use before 0B). |
| Security impact | Smaller UI surface. Masked last digits read from SMS are stored on auto-created accounts (piece 2); tips send DeepSeek category totals only, never message text or account names (piece 3). |
| Cost impact | Tips use the AI budget (piece 3). Piece 1 has none. |
| Acceptance criteria | Piece 1: the spec's tests and commands pass, and the mockup is approved by Mabrur before building. Pieces 2–4 each get their own spec and acceptance criteria. |

## CR-008: Sources read from SMS; credits are income unless they're your own transfer (2026-11-12)

Status: Accepted by Mabrur on 2026-11-12. Spec: `docs/superpowers/specs/2026-11-12-sources-from-sms-design.md` (piece 2 of 4; replaces CR-007's "accounts created from SMS" wording).

| Field | Record |
|---|---|
| Proposed change | Every bank account, card, wallet or cash pile money moves through is a *source*. A source is read from the SMS (name plus last digits), remembered the first time it appears, and shown as a chip. Card type is not tracked: every source is an ordinary money account, and a card is a source whose total goes below ৳0 as you spend, so "debit cards are instruments, not balance-bearing accounts" and "a card purchase raises a liability" no longer apply as written. Any debit counts as Spent and any credit as Came in, except a debit and credit of the same amount on two of the user's sources within 30 minutes, which is a transfer and counts in neither. Same-day or uncertain pairs ask once. Refunds count in Came in. |
| Rationale | Mabrur: "You just need to know what is credit and what is debit." Option 2 chosen over counting every credit, so own transfers don't inflate income. |
| Kept unchanged | Balanced, append-only ledger; withdrawals are never spending; a card bill payment is never spending (it is a transfer); corrections are reverse and replace; AI proposes, deterministic code posts; integer money. |
| Security impact | Masked last digits read from SMS are stored with each source (none are typed). DeepSeek's output adds a source name and optional last digits. |
| Cost impact | None beyond existing AI use. |
| Acceptance criteria | The spec's tests and commands pass, and Mabrur approves the mockup before building. |
