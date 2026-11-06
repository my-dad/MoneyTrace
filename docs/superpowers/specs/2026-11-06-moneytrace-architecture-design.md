# MoneyTrace Architecture Design

Date: 2026-11-06
Status: Draft for review
Source: `MoneyTrace_PRD_v1.0.md` (locked MVP baseline)

## 1. Purpose and scope

An engineering architecture blueprint for MoneyTrace: Clean Architecture combined with SOLID, reusable components, industry coding standards. This is the first deliverable named in PRD §18 ("engineering implementation blueprint"). It contains no feature code. Implementation follows PRD §16 phases 0 to 4, each with its own plan.

Fixed by the PRD: Next.js + TypeScript, Firebase Auth, Cloud Functions (TypeScript), Firestore, AI behind `AIProvider`, OCR behind `OCRProvider`, backend-only ledger writes, atomic/balanced/idempotent/append-only ledger, BDT in integer minor units.

Guiding assumption: the accounting domain (ledger, invariants, matching, reconciliation) is the core. Firebase, DeepSeek, OCR and Next.js are replaceable outer layers.

Success criteria:
- The domain core is testable with no Firebase or network.
- Every external dependency sits behind a port.
- Each PRD §14 release gate (25 to 36) maps to a test at a defined layer.

## 2. Architectural style

Clean Architecture with ports and adapters, and a transactional ledger.
- Append-only `LedgerEntry` records are the source of truth. Balances are derived projections.
- Event sourcing and CQRS were considered and rejected as too heavy for a single-user MVP on Firestore.
- A thin-domain "use cases only" style was rejected because accounting invariants would scatter.

## 3. Repository and package structure

pnpm monorepo.

```
apps/
  web/            Next.js PWA (delivery: UI, hooks, view models)
  functions/      Cloud Functions (delivery: callables, triggers, schedulers)
packages/
  domain/         Pure TS: entities, value objects, invariants, domain services
  application/    Use cases, ports (interfaces), DTOs
  contracts/      Zod schemas and types shared by web, functions, AI output
  infrastructure/ Adapters: Firestore, Storage, DeepSeek, OCR, FCM, Secret Manager
  ui-kit/         Reusable presentational components, no business logic
  config/         Shared tsconfig, ESLint, test config
docs/
  adr/            Architecture Decision Records
  GLOSSARY.md     Domain terms
```

### Dependency rule (enforced by lint and CI)

- `domain` imports nothing (no Zod, no Firebase).
- `application` imports `domain` and `contracts`.
- `infrastructure` implements `application` ports and may import `domain` and `contracts`; nothing inward imports it.
- `apps/*` are composition roots and the only place adapters are wired to ports (manual constructor injection, no DI framework).
- `contracts` holds data shapes and validation only (it may import Zod, never `domain`). `application`, `infrastructure` and the apps may use it.
- `ui-kit` depends on React only.

Enforcement tool: `eslint-plugin-boundaries` or `dependency-cruiser` (choice recorded in an ADR).

### SOLID mapping

- S: one use case per unit (`PostTransaction`, `IngestSms`, `ResolveFollowUp`).
- O: new banks are added as `BankSmsParser` registry entries, with no edits to existing parsers. New posting intents are new strategy classes.
- L: every `AIProvider` and `OCRProvider` adapter passes one shared contract test suite.
- I: small ports (`LedgerWriter` and `LedgerReader` are separate).
- D: use cases depend on ports, never on Firebase.

## 4. Domain model and ledger posting

Value objects (immutable): `Money` (integer minor units + currency; exact add, subtract, allocate; cross-currency operations throw), `AccountId`, `TransactionId`, `SourceEventId`, `IdempotencyKey`, `LedgerDate`.

Aggregates and entities:
- `Account`: kind is `bank | cash | familyCash | creditLiability`. `PaymentInstrument` links to an account and carries no balance.
- `Transaction`: canonical event. Lifecycle `pending → posted | rejected`, and `posted → reversed`. Links to source events.
- `LedgerEntry`: append-only, debit or credit side, exact amount.
- `CashAllocation`, `Reconciliation`, `FollowUp`, `SourceEvent`: separate aggregates with their own rules.

Posting:
- `PostingPolicy` (domain service) converts a typed intent into balanced entries. Intents: `Withdrawal`, `Transfer`, `CardPurchase`, `CardRepayment` (full or partial; the liability reduces by exactly the amount paid), `Fee`, `Refund`, `Adjustment`, `OpeningBalance`, `CashCustodyTransfer` (moves cash between own wallet and `familyCash`; custody change only, never expense), `HistoricalImport` (posts imported history strictly after the cutover marker). Each intent is one strategy class.
- Invariants are enforced in the domain: entries balance per currency; withdrawals and repayments never create expense; opening balances are never income; cash discrepancies require an explicit `Adjustment` with cause, authorization and audit.
- `PostTransaction` use case: check idempotency key, obtain entries from `PostingPolicy`, call `LedgerWriter.commit(transaction, entries)`.
- The Firestore adapter commits in a single Firestore transaction: idempotency record, entries, transaction state and balance projections together.
- Corrections are never edits. `ReverseAndReplace` posts reversing entries and the replacement atomically, preserving actor and rationale as audit trail.

Deduplication: `MatchingService` (domain) scores candidates by amount, account, time window and reference. A link is made automatically only when a unique match exists. Equal-value purchases with distinct evidence stay separate (gate 28).

Pending authorizations: a card authorization creates a `Transaction` in state `pending` with no ledger entries and a `PendingAuthorization` link key (card instrument, amount, merchant text, time window). When the final posting arrives, `MatchingService` links it to the pending transaction and `PostTransaction` posts the entries once, moving the same transaction to `posted`. Expired unmatched authorizations are released by a scheduled job. Pending items never contribute to balances or reports, so nothing is counted twice.

Cutover: a `CutoverMarker` (account, effective timestamp) is written with each `OpeningBalance`. `HistoricalImport` rejects any record dated at or before the marker for that account, and import reconciliation compares the imported closing position against the ledger before posting.

## 5. Ingestion pipeline (SMS, AI, OCR)

Every input becomes a `SourceEvent` first (owner-scoped source hash and idempotency key stored before processing).

Tenant scoping: all idempotency and deduplication uniqueness is owner-scoped, as `(ownerId, idempotencyKey)` and `(ownerId, sourceHash)`. All data lives under `users/{ownerId}/...`, so document IDs cannot collide across users and security rules are path-scoped. `MatchingService` and every repository query are bound to a single `ownerId` and cannot read outside that owner's subtree. The ports take `ownerId` as a required argument, and a test submits identical SMS text and the same idempotency key as two different owners and asserts that both are accepted independently. The user gets an immediate acknowledgment; all later stages are asynchronous.

Stages (each an idempotent use case triggered by a `SourceEvent` status change, keyed on `(sourceEventId, stage)`):

1. `Received`: store the event and acknowledge. Uploads are validated for size and MIME type.
2. `Normalized`: receipts go through `OCRProvider.extract`; SMS text is normalized.
3. `Interpreted`: the `BankSmsParser` registry evaluates **all** applicable parsers (registry order never decides). If exactly one parser returns the highest confidence, or several agree on amount, currency, account and direction, that interpretation is used. If applicable parsers disagree on any of those fields, the event goes to `needsClarification` and is never auto-posted. If no parser matches, `AIProvider.interpretEvidence` runs and its output is Zod-validated into a `CandidateTransaction`. Each parser carries a version, so adding a parser cannot silently change existing interpretations; a regression test replays the SMS fixture corpus on every parser change.
4. `Matched`: `MatchingService` finds duplicates and related events; account mapping is resolved.
5. `Decided`: `ConfidencePolicy` (domain) returns `autoPost`, `needsClarification` (creates a `FollowUp` or chat question) or `failed` (visible review state). Rules: `autoPost` only when all ledger invariants pass, the account mapping is unambiguous, there is no unresolved duplicate candidate, and the source is either a deterministic parser match or an AI candidate at or above a configurable confidence threshold. Anything else is `needsClarification` or `failed`. Threshold values are configuration, tuned against the fixture corpus. Every decision persists a `DecisionRecord` on the `SourceEvent` and the resulting `Transaction`: outcome, parser name and version (or AI model and prompt version), configuration and threshold version, confidence score, the evidence fields used, and the rule that fired. An auto-post can therefore be explained and reproduced after configuration changes.
6. `Posted` or `Pending`: `PostTransaction` runs. Chat reports only the confirmed state. (`Pending` here means the `SourceEvent` is awaiting clarification or AI quota; it is distinct from the `Transaction` lifecycle state `pending`.)
7. `Cleanup` (receipts): `DeleteTemporaryUpload` runs after structured evidence is persisted, verifies deletion and retries on failure. A scheduled sweeper removes abandoned uploads past their deadline.

Concurrency and claim protocol (Firestore triggers are at-least-once and may run concurrently):
- Each `SourceEvent` carries `status`, `stageAttempt`, `claim { workerId, stage, leaseExpiresAt }` and `version`.
- A worker claims a stage in one Firestore transaction: read the event, proceed only if `status` equals the stage's expected input state and there is no live claim, then write `claim` with a lease and increment `version`. Losing the race means exiting silently.
- Side effects are written under the claim: the stage output, the next `status` and the claim release are committed together in one transaction that re-checks `version`. Stage outputs use deterministic document IDs derived from `(sourceEventId, stage)` (for example the `FollowUp` and `DecisionRecord`), so a duplicate worker cannot create a second copy.
- External calls (AI, OCR) go through a durable `ProviderCall` record so a retry never repeats a call whose outcome is already known:
  1. After claiming, the worker get-or-creates `ProviderCall` with deterministic ID `(ownerId, sourceEventId, stage)` and fields `state` (`started | succeeded | failed | abandoned`), `requestKey`, `attemptCount`, `quotaReservation`, `result`. `requestKey` is derived from `(ownerId, sourceEventId, stage)` and stays the same across attempts, so a provider that honors idempotency keys can recognize a retry as the same request.
  2. If `state` is `succeeded`, the worker reuses the stored `result` and never calls the provider. A failed Firestore stage commit after provider success therefore costs nothing on retry.
  3. The call runs under a hard timeout that is strictly shorter than the lease (`timeout + margin < leaseDuration`), and a heartbeat extends the lease while the call is in flight. Recovery reopens a stage only after lease expiry, so by construction the original call has ended or been aborted.
  4. The provider result is written to `ProviderCall` (`state = succeeded`) in its own write immediately after the response, before the stage commit. Results are stored in minimized form and follow the retention policy in section 7. If the worker dies between the provider response and this write, the result is lost and the retry calls the provider again; this window is small but cannot be closed from our side, and step 5 bounds its cost.
  5. Adapters declare `supportsIdempotencyKey`. Where the provider honors an idempotency header, the adapter sends `requestKey`. Where it does not, a timed-out call may still be billed by the provider; this residual cost is bounded by `maxAttempts` and by charging the quota reservation for every attempt, and is reconciled against provider-reported usage when available. The spec does not claim zero duplicate billing for such providers.
  6. If a lease expires, a scheduled recovery job re-opens the stage with a higher `stageAttempt`. A late worker's commit fails the `version` check and is discarded.
- `PostTransaction` is additionally protected by its own idempotency record inside the ledger transaction, so even a claim failure cannot double-post.
- Attempts are bounded; after the limit the event moves to the dead-letter review state.

Ports: `OCRProvider`, `AIProvider`, `SourceEventRepository`, `UploadStore`, `Clock`, `Logger`.

Resilience:
- Bounded retries with backoff; a dead-letter state is shown in the Inbox.
- `AIGateway` decorates any `AIProvider`: per-request, daily and monthly quotas, token and cost metering, timeouts. On quota exhaustion the event stays `Pending` with reason `aiQuotaExhausted` and non-AI features continue.
- Recovery of quota-blocked events: a scheduled `ResumeQuotaBlockedEvents` job runs after each daily and monthly quota window rolls over and when the user raises the budget. It re-opens blocked events oldest first, within the new quota, using the same claim protocol so resumption is idempotent. The user can also trigger a manual retry from the Inbox. Each blocked event shows its reason, retry count and next scheduled attempt; none stays pending silently. Events that can be interpreted deterministically never wait for quota.
- Provider details (DeepSeek auth, model names, JSON handling) stay inside the adapter. OCR candidates (Tesseract.js, managed OCR) implement the same contract. OCR runs server-side behind `OCRProvider`. Server-side execution does not keep the document inside our infrastructure when a managed provider is used, so each `OCRProvider` declares an `OcrPrivacyProfile`: `processing` (`local | managed`), region, provider retention and deletion guarantees, and whether the provider may train on content. A managed provider is eligible only if its terms were reviewed and recorded in an ADR, its profile meets the PRD §10 requirements, and the user has given explicit opt-in consent in Settings (stored with a consent version). When consent is absent or no eligible managed provider exists, only local OCR (Tesseract.js) is used and low-quality results go to retry or clarification, never to a managed fallback. The privacy copy shown to the user states that deletion from active storage does not guarantee deletion of provider-side copies or backups (PRD §10). The provider choice is made by an ADR after the Phase 2 benchmark.

## 6. Web application (Next.js PWA)

`apps/web` layout:
- `app/`: routes and layouts; pages are thin.
- `features/<name>/`: `home`, `chat`, `activity`, `accounts`, `reports`, `settings`; each has `components/`, `hooks/`, `view-models/`.
- `shared/`: cross-feature hooks, money and date formatting, API client.

`packages/ui-kit` components: `Button`, `Card`, `StatusBadge`, `MoneyText`, `ListItem`, `BottomSheet`, `Composer`, `FileDropzone`, `EmptyState`, `FormField`. Token-driven theming, accessible by default, keyboard-navigable, touch-sized. No Firebase calls, no business logic.

Data flow:
- The web app never writes the ledger. Commands go to Cloud Functions callables typed by `contracts`.
- Reads use Firestore real-time listeners behind a `ReadModelGateway` interface (in-memory fake for tests).
- Server state: TanStack Query. Local UI state stays inside the feature; no global store initially.
- View models map read models to display state (pending, verified, provisional, formatted money). Components receive plain props.

PWA:
- Service worker caches the shell and shows an offline banner. No offline write queue in the MVP.
- FCM push is opt-in; the in-app inbox is the reliable baseline.
- Chat shows "received" immediately, then real stage statuses. Never success before backend confirmation.

Quality: axe accessibility checks in CI; Storybook with Vitest and Testing Library.

## 7. Cross-cutting concerns

Testing (mapped to PRD §14 gates):
- Domain unit tests (Vitest): posting invariants (25, 26, 32, 33, 36), `Money`, `MatchingService` (27, 28). Property-based tests (fast-check) for "entries always balance" and "reverse then replace nets to zero".
- Application tests with in-memory port fakes: use-case flows, pipeline stages, quota exhaustion (34), follow-up scheduling (31).
- Adapter contract tests: one shared suite per port, run against every implementation.
- Integration tests on Firebase emulators: Firestore transactions and idempotency, Security Rules cross-user denial (35), receipt deletion and retry (29, 30).
- Fixture corpora: versioned bank SMS samples and Bangla/English receipts with expected outputs.
- E2E (Playwright): SMS to posted, and ATM follow-up only.

Release-gate traceability (every gate has one owning implementation boundary and at least one named test layer):

| Gate | Behavior | Implementation boundary | Tests |
|------|----------|-------------------------|-------|
| 25 | Withdrawal moves bank to cash, no expense | `domain`: `PostingPolicy` `Withdrawal` strategy; `application`: `PostTransaction` | Domain unit; property test (balance); fixture ATM SMS in application test |
| 26 | Card purchase once, partial repayment reduces liability by amount paid | `domain`: `CardPurchase` and `CardRepayment` strategies | Domain unit; emulator integration for atomic commit |
| 27 | SMS plus receipt yield one expense, both sources linked | `domain`: `MatchingService`; `application`: `Matched` stage | Application test with SMS and receipt fixture pair |
| 28 | Equal-value distinct purchases not merged | `domain`: `MatchingService` | Domain unit; application test |
| 29 | Unreadable receipt: retry, no guessed post | `application`: `Normalized` and `Decided` stages, `ConfidencePolicy` | Application test with fake OCR returning low quality |
| 30 | Valid receipt persists evidence; deletion confirmed or retried | `application`: `DeleteTemporaryUpload`; `infrastructure`: `UploadStore` | Emulator integration (Storage); application retry test |
| 31 | Follow-up at scheduled time, stops when resolved or snoozed | `domain`: `FollowUp`; `application`: `ScheduleFollowUps`, `ResolveFollowUp` | Application test with fake `Clock`; emulator scheduler test |
| 32 | Cash count difference visible, no silent adjustment | `domain`: `Reconciliation`; `application`: `RecordReconciliation` | Domain unit; application test |
| 33 | Edit via reversal and replacement keeps audit | `domain`: `ReverseAndReplace`; `infrastructure`: `LedgerWriter` | Domain unit; property test (net zero); emulator integration |
| 34 | AI budget exhausted: non-AI continues, evidence kept, later resumed | `application`: `AIGateway`, `ResumeQuotaBlockedEvents` | Application test with fake `Clock` and quota |
| 35 | Cross-user access denied | Firestore and Storage rules; callable ownership middleware | Emulator integration (rules unit tests, callable auth tests) |
| 36 | Import cutover prevents duplicate opening effects | `domain`: `CutoverMarker`, `HistoricalImport` | Domain unit; application test |
| n/a (PRD §7) | Pending authorization and final posting counted once | `domain`: `PendingAuthorization` rules, `MatchingService` | Domain unit; application test |
| n/a (PRD §7) | Family cash custody is not spending | `domain`: `CashCustodyTransfer` strategy | Domain unit; report-level test |
| n/a (§5) | Concurrent duplicate stage processing | `application`: claim protocol; `infrastructure`: `SourceEventRepository` | Emulator integration with parallel workers |
| n/a (§5) | Provider call not repeated after lease expiry or lost commit | `application`: `ProviderCall` get-or-create flow; adapter `supportsIdempotencyKey` | Application test with fake provider and injected commit failure; emulator integration for lease expiry |
| n/a (§5) | Keys and matching are owner-scoped | `application` and `infrastructure`: `ownerId` on every port; path-scoped rules | Two-owner emulator test (same SMS, same key); rules unit tests |
| n/a (PRD §10) | Export, deletion and retention | `application`: `ExportUserData`, `RequestAccountDeletion`, `RetentionPolicy` | Phase 4 emulator acceptance tests (full export; deletion verified and retried) |
| n/a (PRD §10) | Backup and restore | `infrastructure`: backup configuration and deletion-log replay | Phase 0 staging restore drill, repeated before the pilot |

Mandatory gates: the emulator integration and application tests in this table (receipt deletion, card partial repayment, cross-user isolation, claim and provider-call tests, retention and restore) are required CI and release gates that block merge and release. They are not optional coverage. E2E stays deliberately limited to the two critical paths because the lower layers own correctness.

Security:
- Firestore and Storage rules are deny-by-default and owner-scoped. Ledger collections are read-only to clients.
- Callables verify the Auth token and ownership in shared middleware. App Check is supplemental.
- Secrets in Secret Manager. PII redacted before logging or AI calls. The AI receives only a scoped `authorizedFinancialContext`.

Observability: `Logger` port with structured JSON and a correlation ID carried through every pipeline stage; `AIUsage` records drive cost dashboards and alerts; job status and deletion confirmations are recorded.

Retention, backup, export and deletion (`application` use cases, `infrastructure` adapters):
- A versioned `RetentionPolicy` configuration defines each data class: temporary uploads (deadline from the cleanup sweeper), extracted evidence and audit history (kept per the disclosed policy), `ProviderCall` results and conversation messages (bounded retention window), and logs (short retention, no raw financial content). The policy version is shown to the user in Settings.
- `ExportUserData` produces a complete export of the owner's records (accounts, transactions, entries, evidence, audit) in a documented format.
- `RequestAccountDeletion` creates a `DeletionJob` that removes the owner's entire subtree and Storage objects, verifies the result and retries failures. The user's deletion right takes precedence over ledger immutability, and only a minimal tombstone with no financial content remains as proof of deletion.
- Backups: Firestore managed backups with point-in-time recovery and a defined retention period, disclosed to the user. Deletion does not reach backups; the disclosure says so (PRD §10). A deletion log is replayed after any restore so deleted data is not resurrected.
- A restore drill runs in staging and is repeated before the pilot. Provider-side copies (managed OCR, AI) follow the provider profile and consent rules in section 5.

CI/CD and standards:
- GitHub Actions per PR: lint, typecheck, boundary check, unit, emulator integration, build. Deploy to staging first.
- TypeScript `strict` plus `noUncheckedIndexedAccess`; ESLint; Prettier; Conventional Commits.
- ADRs for decisions such as OCR provider and boundary-lint tool; glossary for domain terms.
- Separate Firebase projects: dev, staging, prod.
- No DI framework, no premature microservices, no feature code beyond the current phase's gate.

## 8. Out of scope for this spec

This spec fixes boundaries, rules and protocols. The concrete artifacts below are deferred, but the Phase 0 plan **must produce and review them before any feature code** (Phase 1 may not start until they exist and pass their tests):

- Firestore collection schemas, indexes and the balance projection design.
- Callable and trigger contracts (`contracts` package) for every command.
- Firestore and Storage Security Rules, with cross-user emulator tests.
- Initial `ConfidencePolicy` rule set and configuration schema (threshold values themselves are tuned in Phase 1 against fixtures).
- The claim-protocol and `ProviderCall` implementation with their concurrency and failure-injection tests.
- The `RetentionPolicy` schema, backup configuration and the first staging restore drill (Phase 0); `ExportUserData` and `RequestAccountDeletion` are delivered and tested in Phase 4.
- ADRs for the boundary-lint tool, and for the OCR provider after the Phase 2 benchmark.

Each PRD phase gets its own plan; the first plan covers Phase 0 (Foundations) only.
