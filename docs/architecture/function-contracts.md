# Function contracts

Schemas live in `packages/contracts/src/commands/` and `packages/contracts/src/triggers.ts`. Every request and response is a strict Zod object, so unknown fields are rejected. No request carries `ownerId`: the owner always comes from the verified Auth token, and a body that includes one fails as `invalidArgument`. Money is integer minor units plus a currency code (BDT only). Amounts that are floats, strings, `NaN` or outside the safe integer range are rejected before any write.

Common error codes for every command: `unauthenticated` (no verified token), `invalidArgument` (schema failure), `notFound` (missing or owned by someone else, indistinguishable by design). A command that takes an `idempotencyKey` returns `idempotencyConflict` when the key was used with a different payload. Handlers ship in the listed phase. The contract exists from Phase 0.

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

Errors: unauthenticated, invalidArgument

Use case: CreateAccount

### recordOpeningBalance

Phase: 0

Request: `{ accountId, amountMinor, currency, effectiveAtMs }`. `amountMinor` is a non-negative safe integer.

Response: `{ transactionId, status: recorded|alreadyRecorded }`

Errors: unauthenticated, invalidArgument, notFound (account missing or not owned), openingBalanceConflict (different amount or date for an account that already has one)

Use case: RecordOpeningBalance

### createPaymentInstrument

Phase: 1

Request: `{ accountId, maskedIdentifier, type: debitCard|creditCard }`

Response: `{ instrumentId }`

Errors: unauthenticated, invalidArgument, notFound

Use case: CreatePaymentInstrument

### updateSettings

Phase: 1

Request: `{ reportingCycle?, reminders?, aiBudget? }`

Response: `{ updated }`

Errors: unauthenticated, invalidArgument

Use case: UpdateSettings

### submitEvidence

Phase: 1

Request: `{ idempotencyKey, text }`. `text` is 1 to 10,000 characters.

Response: `{ sourceEventId, status, duplicate }`

Errors: unauthenticated, invalidArgument, idempotencyConflict

Use case: SubmitEvidence

### sendChatMessage

Phase: 1

Request: `{ conversationId, text }`. `text` is 1 to 10,000 characters.

Response: `{ messageId, status: accepted|pending }`

Errors: unauthenticated, invalidArgument, notFound

Use case: SendChatMessage

### confirmCandidate

Phase: 1

Request: `{ sourceEventId, decision: confirm|reject, overrides? }`

Response: `{ status: recorded|rejected|pending, transactionId? }`

Errors: unauthenticated, invalidArgument, notFound, invalidTransition

Use case: ConfirmCandidate

### resolveFollowUp

Phase: 1

Request: `{ followUpId, resolution: {kind: answer, text} | {kind: dismiss} }`

Response: `{ state: resolved|dismissed }`

Errors: unauthenticated, invalidArgument, notFound

Use case: ResolveFollowUp

### snoozeFollowUp

Phase: 1

Request: `{ followUpId, untilMs }`

Response: `{ state: snoozed }`

Errors: unauthenticated, invalidArgument, notFound

Use case: SnoozeFollowUp

### retrySourceEvent

Phase: 1

Request: `{ sourceEventId }`. An explicit user retry, the only way to re-send a provider call whose outcome is unknown.

Response: `{ status }`

Errors: unauthenticated, notFound, invalidTransition

Use case: RetrySourceEvent

### cancelSourceEvent

Phase: 1

Request: `{ sourceEventId }`

Response: `{ status }`

Errors: unauthenticated, notFound, invalidTransition

Use case: CancelSourceEvent

### correctTransaction

Phase: 1

Request: `{ idempotencyKey, transactionId, replacement?, rationale }`. Omitting `replacement` reverses only.

Response: `{ reversalTransactionId, replacementTransactionId?, status: recorded|alreadyRecorded }`

Errors: unauthenticated, invalidArgument, notFound, idempotencyConflict, alreadyReversed

Use case: CorrectTransaction (reversal plus replacement, atomic)

### recordCustodyTransfer

Phase: 1

Request: `{ idempotencyKey, fromAccountId, toAccountId, amountMinor, currency, holderName }`. Changes custody, never an expense.

Response: `{ transactionId, status: recorded|alreadyRecorded }`

Errors: unauthenticated, invalidArgument, notFound, idempotencyConflict

Use case: RecordCustodyTransfer

### upsertCashAllocation

Phase: 1

Request: `{ walletId, purpose, amountMinor, currency }`

Response: `{ allocationId }`

Errors: unauthenticated, invalidArgument, notFound

Use case: UpsertCashAllocation

### createUploadSession

Phase: 2

Request: `{ mimeType, sizeBytes }`. MIME is image/jpeg, image/png, image/webp or application/pdf. Size is 1 byte to 10 MB. Same limits as `storage.rules`.

Response: `{ uploadId, uploadPath, expiresAtMs }`

Errors: unauthenticated, invalidArgument

Use case: CreateUploadSession

### finalizeUpload

Phase: 2

Request: `{ uploadId, idempotencyKey }`

Response: `{ sourceEventId, duplicate }`

Errors: unauthenticated, notFound, idempotencyConflict, consentRequired

Use case: FinalizeUpload

### setOcrConsent

Phase: 2

Request: `{ consentVersion, granted }`

Response: `{ granted }`

Errors: unauthenticated, invalidArgument

Use case: SetOcrConsent

### recordReconciliation

Phase: 3

Request: `{ accountId, countedMinor, currency, countedAtMs }`. A difference is never auto-categorized as spending.

Response: `{ reconciliationId, differenceMinor }`

Errors: unauthenticated, invalidArgument, notFound

Use case: RecordReconciliation

### recordAdjustment

Phase: 3

Request: `{ idempotencyKey, accountId, direction: increase|decrease, amountMinor, currency, cause }`

Response: `{ transactionId, status: recorded|alreadyRecorded }`

Errors: unauthenticated, invalidArgument, notFound, idempotencyConflict

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

Errors: unauthenticated, invalidArgument

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
