# Function contracts

Schemas live in `packages/contracts/src/commands/` and `packages/contracts/src/triggers.ts`. Every request and response is a strict Zod object, so unknown fields are rejected. No request carries `ownerId`: the owner always comes from the verified Auth token, and a body that includes one fails as `invalid-argument`. Money is integer minor units plus a currency code (BDT only). Amounts that are floats, strings, `NaN` or outside the safe integer range are rejected before any write.

## Wire mapping

Every handler maps failures to Firebase callable codes exactly like this:

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

Phase: 1

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

Request: `{ followUpId, resolution: {kind: answer, text} | {kind: dismiss} }`

Response: `{ state: resolved|dismissed }`

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

Request: `{ idempotencyKey, fromAccountId, toAccountId, amountMinor, currency, holderName }`. Changes custody, never an expense.

Response: `{ transactionId, status: recorded|alreadyRecorded }`

Errors: unauthenticated, invalid-argument, not-found, already-exists (idempotencyConflict)

Use case: RecordCustodyTransfer

### upsertCashAllocation

Phase: 1

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

Phase: 3

Request: `{ accountId, countedMinor, currency, countedAtMs }`. A difference is never auto-categorized as spending.

Response: `{ reconciliationId, differenceMinor }`

Errors: unauthenticated, invalid-argument, not-found

Use case: RecordReconciliation

### recordAdjustment

Phase: 3

Request: `{ idempotencyKey, accountId, direction: increase|decrease, amountMinor, currency, cause }`

Response: `{ transactionId, status: recorded|alreadyRecorded }`

Errors: unauthenticated, invalid-argument, not-found, already-exists (idempotencyConflict)

Use case: RecordAdjustment

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
