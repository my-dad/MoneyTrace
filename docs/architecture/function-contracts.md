# Function contracts

Schemas live in `packages/contracts/src/commands/` and `packages/contracts/src/triggers.ts`. Every request and response is a strict Zod object, so unknown fields are rejected. No request carries `ownerId`: the owner always comes from the verified Auth token, and a body that includes one fails as `invalid-argument`. Money is integer minor units plus a currency code (BDT only). Amounts that are floats, strings, `NaN` or outside the safe integer range are rejected before any write.

## Wire mapping

Every handler maps failures to these wire codes (`/api` also sets the matching HTTP status: 400, 401, 403, 404, 409, 429 or 500):

- No verified Auth token: `unauthenticated`.
- Request schema failure: `invalid-argument`.
- `DomainError('accountInvalid')`: `not-found`. A missing account and another user's account are indistinguishable by design.
- Any other `DomainError`: `failed-precondition`, carrying the domain code only.
- `idempotencyConflict`: `already-exists`.
- Anything else: `internal`, with no detail.

Commands with a missing non-account resource (transaction, follow-up, upload, source event) arrive in later phases. `DomainError('resourceNotFound')` covers them and maps to `not-found`.

Per-command `Errors:` lines use these wire codes, with the domain code in parentheses where one exists today. Any command whose use case derives or accepts an idempotency key returns `idempotencyConflict` when that key meets a different payload. Handlers ship in the listed phase. The contract exists from Phase 0.

## Commands

### bootstrapUser

Phase: 0

Request: `{}`

Response: `{ created: boolean }`

Errors: unauthenticated

Use case: BootstrapUser (create profile if absent)

### createAccount

Phase: 0

Request: `{ kind: bank|cash|familyCash|creditLiability, name, currency }`

Response: `{ accountId }`

Errors: unauthenticated, invalid-argument

Use case: CreateAccount

### recordOpeningBalance

Phase: 0

Request: `{ accountId, amountMinor, currency, effectiveAtMs }`. `amountMinor` is a signed safe integer, zero allowed. Positive asset means the account holds funds, positive liability means the amount owed, and negative flips each (overdraft, or a card in credit).

Response: `{ transactionId, status: recorded|alreadyRecorded }`

Errors: unauthenticated, invalid-argument, not-found (accountInvalid), already-exists (idempotencyConflict; a different amount or date for an account that already has an opening balance; the use case derives its own key, so the first stands and the correction path is explicit)

Use case: RecordOpeningBalance

### createPaymentInstrument

Phase: 1

Request: `{ accountId, provider, maskedIdentifier (last 3 or 4 digits, empty for a wallet), type: debitCard|creditCard|mobileWallet|bankAccount }`

Response: `{ instrumentId }`

Errors: unauthenticated, invalid-argument, not-found

Use case: CreatePaymentInstrument

### updateSettings

Phase: 1

Request: `{ reportingCycle?, reminders?, aiBudget? }`

Response: `{ updated }`

Errors: unauthenticated, invalid-argument

Use case: UpdateSettings

### submitEvidence

Phase: 1

Request: `{ idempotencyKey, text }`. `text` is 1 to 10,000 characters.

Response: `{ sourceEventId, status, duplicate }`

Errors: unauthenticated, invalid-argument, already-exists (idempotencyConflict)

Use case: SubmitEvidence

### sendChatMessage

Phase: 3

Request: `{ conversationId, text }`. `text` is 1 to 10,000 characters.

Response: `{ messageId, status: accepted|pending }`

Errors: unauthenticated, invalid-argument, not-found

Use case: SendChatMessage

### confirmCandidate

Phase: 1

Request: `{ sourceEventId, decision: confirm|reject|link, overrides?: { kind?, amountMinor?, currency?, accountId?, destinationAccountId?, occurredAtMs?, category? } }`

Response: `{ status: pending|rejected|linked }`

Errors: unauthenticated, invalid-argument, not-found, failed-precondition (invalidTransition)

Use case: ConfirmCandidate

### resolveFollowUp

Phase: 1

Request: `{ followUpId, resolution: {kind: destination, accountId} | {kind: notSureYet} }`

Response: `{ state: resolved|open }`

Errors: unauthenticated, invalid-argument, not-found

Use case: ResolveFollowUp

### snoozeFollowUp

Phase: 1

Request: `{ followUpId, untilMs }`

Response: `{ state: snoozed }`

Errors: unauthenticated, invalid-argument, not-found

Use case: SnoozeFollowUp

### retrySourceEvent

Phase: 1

Request: `{ sourceEventId }`. An explicit user retry, the only way to re-send a provider call whose outcome is unknown.

Response: `{ status }`

Errors: unauthenticated, not-found, failed-precondition (invalidTransition)

Use case: RetrySourceEvent

### answerQuestion

Phase: 1 (CR-008)

Request: `{ sourceEventId, answer? | skip? }`, exactly one. The answer is 1–500 characters and is refused if it looks like a secret (an OTP or PIN).

Response: `{ status }`

Errors: unauthenticated, invalid-argument, not-found, failed-precondition (invalidTransition when the event isn't waiting on DeepSeek's question; sensitiveEvidence)

Use case: AnswerQuestion. It stores the answer with DeepSeek's latest question and re-reads the evidence; a skip shows the reading so far.

### cancelSourceEvent

Phase: 1

Request: `{ sourceEventId }`

Response: `{ status }`

Errors: unauthenticated, not-found, failed-precondition (invalidTransition)

Use case: CancelSourceEvent

### correctTransaction

Phase: 1

Request: `{ idempotencyKey, transactionId, replacement?, rationale }`. Omitting `replacement` reverses only.

Response: `{ reversalTransactionId, replacementTransactionId?, status: recorded|alreadyRecorded }`

Errors: unauthenticated, invalid-argument, not-found, already-exists (idempotencyConflict)

Use case: CorrectTransaction (reversal plus replacement, atomic)

### recordCustodyTransfer

Phase: 1

Request: `{ idempotencyKey, fromAccountId, toAccountId, amountMinor, currency, holderName, occurredAtMs }`. Changes custody, never an expense.

Response: `{ transactionId, status: recorded|alreadyRecorded }`

Errors: unauthenticated, invalid-argument, not-found, already-exists (idempotencyConflict)

Use case: RecordCustodyTransfer

### upsertCashAllocation

Phase: 3

Request: `{ walletId, purpose, amountMinor, currency }`

Response: `{ allocationId }`

Errors: unauthenticated, invalid-argument, not-found

Use case: UpsertCashAllocation

### createUploadSession

Phase: 2

Request: `{ mimeType, sizeBytes }`. MIME is image/jpeg, image/png, image/webp or application/pdf. Size is 1 byte to 10 MB. Same limits as `storage.rules`.

Response: `{ uploadId, uploadPath, expiresAtMs }`

Errors: unauthenticated, invalid-argument

Use case: CreateUploadSession

### finalizeUpload

Phase: 2

Request: `{ uploadId, idempotencyKey }`

Response: `{ sourceEventId, duplicate }`

Errors: unauthenticated, not-found, already-exists (idempotencyConflict)

Use case: FinalizeUpload

### setOcrConsent

Phase: 2

Request: `{ consentVersion, granted }`

Response: `{ granted }`

Errors: unauthenticated, invalid-argument

Use case: SetOcrConsent

### recordReconciliation

Phase: 1

Request: `{ idempotencyKey, countedMinor, currency }`. A cash count (gate 32): compared with every active Cash account, `cash-unassigned` included and family cash left out. It never changes a balance, and a difference is never counted as spending. A non-zero difference opens a `reconciliationDifference` follow-up; a new count supersedes older open ones.

Response: `{ reconciliationId, status, countedMinor, expectedMinor, cashMinor, unexplainedMinor, differenceMinor, followUpId? }`

Errors: unauthenticated, invalid-argument

Use case: RecordCashCount

### recordAdjustment

Phase: 1

Request: `{ reconciliationId, cause }`. Adjusts Cash to an open count; direction and amount come from the stored count. A short count is taken from `cash-unassigned` first, then `cash-main`, in one `adjustment` posting with the cause and the owner's sign-off, never an expense; emptying `cash-unassigned` closes its open withdrawal questions as "counted". An increase goes to `cash-main`.

Response: `{ transactionId, status: recorded|alreadyRecorded, countedMinor, adjustmentMinor }`

Errors: unauthenticated, invalid-argument, not-found, failed-precondition (the count is not open)

Use case: RecordCashAdjustment

### splitTransfer

Phase: 1

Request: `{ sourceEventId }`. "Not a transfer" (CR-008 §9): reverses the paired transfer and, in the same ledger write, records the first SMS as it was and the second as its own Spent or Came in.

Response: `{ spentTransactionId, cameInTransactionId, amountMinor, status: recorded|alreadyRecorded }`

Errors: unauthenticated, not-found, failed-precondition (not a paired transfer, or already corrected)

Use case: SplitTransfer

### requestExport

Phase: 4

Request: `{}`

Response: `{ requestId }`

Errors: unauthenticated

Use case: RequestExport

### requestAccountDeletion

Phase: 4

Request: `{ confirmation: "DELETE MY ACCOUNT" }`

Response: `{ requestId }`

Errors: unauthenticated, invalid-argument

Use case: RequestAccountDeletion

## Triggers

### onSourceEventWritten

Kind: firestore

Source: `users/{uid}/sourceEvents/{id}`

Phase deployed: 1

Input: `{ ownerId, sourceEventId }` taken from the document path

Errors: none surfaced to clients. Failures are retried with backoff, then parked for review.

Use case: RunPipelineStage

### recoverExpiredClaims

Kind: schedule

Source: every 5 minutes

Phase deployed: 1

Input: none

Errors: none surfaced to clients. Failures are retried with backoff, then parked for review.

Use case: RecoverExpiredClaims

### dispatchFollowUps

Kind: schedule

Source: every 15 minutes

Phase deployed: 1

Input: none

Errors: none surfaced to clients. Failures are retried with backoff, then parked for review.

Use case: DispatchFollowUps

### resumeQuotaBlockedEvents

Kind: schedule

Source: hourly

Phase deployed: 1

Input: none

Errors: none surfaced to clients. Failures are retried with backoff, then parked for review.

Use case: ResumeQuotaBlockedEvents

### sweepAbandonedUploads

Kind: schedule

Source: hourly

Phase deployed: 2

Input: none

Errors: none surfaced to clients. Failures are retried with backoff, then parked for review.

Use case: SweepAbandonedUploads

### purgeProviderResults

Kind: schedule

Source: daily

Phase deployed: 1

Input: none

Errors: none surfaced to clients. Failures are retried with backoff, then parked for review.

Use case: PurgeProviderResults
