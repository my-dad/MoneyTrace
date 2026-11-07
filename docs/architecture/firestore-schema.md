# Firestore schema

All owner data lives under `users/{ownerId}/...`. Schemas are strict Zod objects in `packages/contracts/src/firestore/collections.ts`, so unknown fields are rejected. Money is integer minor units plus a currency code. Retention, export and client-read treatment per collection are in `owner-data-registry.ts`.

The `users/{uid}` document is `userProfileSchema`: baseCurrency, reportingCycle (calendarMonth or salaryCycle with startDay), notifications, retentionPolicyVersion, createdAtMs.

The top-level `deletionLog` collection is server-only and outside `users/`, so it survives account deletion. Entries are `{ ownerIdHash, deletedAtMs }`. It is not an owner collection and is not in the registry.

## Owner collections

### accounts

Path: `users/{ownerId}/accounts/{docId}`

Fields: id, kind (bank|cash|familyCash|creditLiability), name, currency, status (active|closed), createdAtMs. Nominal accounts (expense, income, equity) are never stored here.

### paymentInstruments

Path: `users/{ownerId}/paymentInstruments/{docId}`

Fields: id, kind (debitCard|creditCard), maskedIdentifier, linkedAccountId, status, createdAtMs. Debit instruments link to a bank account, credit instruments to a liability. Never a balance.

### sourceEvents

Path: `users/{ownerId}/sourceEvents/{docId}`

Fields: id, sourceType (sms|receipt|chat|csvImport), sourceHash, idempotencyKey, status, pendingReason?, deadLetterReason?, stageAttempt, claim {workerId, stage, leaseExpiresAtMs} or null, parkedStage or null, version, receivedAtMs, terminalAtMs or null, providerResultsPurged, retainedText (identifiers masked), candidate or null, extraction or null, matchedTransactionId or null, resolvedAccountId or null, userConfirmed.

### providerCalls

Path: `users/{ownerId}/providerCalls/{docId}`

Fields: id, sourceEventId, stage, providerId, retrySafety (idempotentKey|localPure|none), state (started|succeeded|failed|unknown|purged), requestKey, attemptCount, userApprovedRetry, retriedAfterUnknown, quotaReservationId?, result?, updatedAtMs. Server-only; retention class providerResult.

### transactions

Path: `users/{ownerId}/transactions/{docId}`

Fields: id, state (pending|posted|rejected|reversed), intentType, occurredAtMs, currency, sourceEventIds, actor, rationale?, correctionOf?, reversedBy?, auditDetails? {cause?, authorizedBy?, holderName?}, committedAtMs. auditDetails keeps the cause and authorization of adjustments and the holder's name for custody transfers.

### ledgerEntries

Path: `users/{ownerId}/ledgerEntries/{docId}`

Fields: id (`<transactionId>:<seq>`), transactionId, accountId, accountKind, side (debit|credit), amountMinor (positive integer), currency, occurredAtMs. Append-only and immutable.

### balances

Path: `users/{ownerId}/balances/{docId}`

Fields: accountId, accountKind, currency, debitMinusCreditMinor (signed raw), version, updatedAtMs. A liability's displayed amount owed is the negation.

### idempotencyRecords

Path: `users/{ownerId}/idempotencyRecords/{docId}`

Fields: key, payloadHash, transactionId?, sourceEventId?, createdAtMs. Document IDs are namespaced: `ledger:<key>`, `source:<key>`, `hash:<sourceHash>`. Server-only; excluded from export.

### cutoverMarkers

Path: `users/{ownerId}/cutoverMarkers/{docId}`

Fields: accountId, effectiveAtMs, transactionId. Imports at or before the marker are rejected.

### decisionRecords

Path: `users/{ownerId}/decisionRecords/{docId}`

Fields: Discriminated on `source`. Common: id, outcome (autoPost|needsClarification|failed), rule, configVersion, aiAutoPostThresholdBp, confidenceBp (0 to 10000), evidenceFields, retriedAfterUnknown, sourceEventIds, createdAtMs. `deterministicParser` adds parser {name, version}; `ai` adds ai {model, promptVersion}.

### cashAllocations

Path: `users/{ownerId}/cashAllocations/{docId}`

Fields: id, walletAccountId, purpose, currency, allocatedMinor, remainingMinor, status (active|exhausted|closed), history [{atMs, kind (allocated|spent|released), amountMinor, transactionId?}] (max 200), createdAtMs, updatedAtMs. An allocation is not a spend.

### reconciliations

Path: `users/{ownerId}/reconciliations/{docId}`

Fields: id, accountId, kind (statement|cashCount), currency, asOfMs, statedBalanceMinor, expectedBalanceMinor, differenceMinor, reviewStatus (open|reviewed|adjusted|dismissed), adjustmentTransactionIds, createdAtMs, updatedAtMs. A difference is never auto-categorized as spending.

### followUps

Path: `users/{ownerId}/followUps/{docId}`

Fields: id, trigger (withdrawalDestination|unreviewedCashActivity|reconciliationDifference), targetTransactionId?, targetAccountId?, question, dueAtMs, snoozedUntilMs or null, state (open|snoozed|resolved|dismissed), resolution?, createdAtMs, resolvedAtMs or null.

### conversations

Path: `users/{ownerId}/conversations/{docId}`

Fields: id, title?, createdAtMs, updatedAtMs, expiresAtMs. Retention class conversation.

### conversationMessages

Path: `users/{ownerId}/conversationMessages/{docId}`

Fields: id, conversationId, role (user|assistant), text, evidenceSourceEventIds, approvedOperationIds, createdAtMs, expiresAtMs. Retention class conversation.

### aiUsage

Path: `users/{ownerId}/aiUsage/{docId}`

Fields: id, providerId, model?, inputTokens?, outputTokens?, estimatedMicroUsd, actualMicroUsd?, outcome (success|definiteFailure|unknown), errorCode?, userApprovedRetry, sourceEventId, stage, attempt, createdAtMs.

### quotaCounters

Path: `users/{ownerId}/quotaCounters/{docId}`

Fields: window (`YYYY-MM` or `YYYY-MM-DD`, UTC; also the document ID), reservedMicroUsd, warnedAtMs or null, updatedAtMs. Server-only.

### temporaryUploads

Path: `users/{ownerId}/temporaryUploads/{docId}`

Fields: id, storagePath, mimeType, sizeBytes, state (uploaded|processing|persisted|deleted|deletionFailed|expired), sourceEventId?, createdAtMs, expiresAtMs, deletionAttempts, deletionVerifiedAtMs or null. Retention class temporaryUpload.

### consents

Path: `users/{ownerId}/consents/{docId}`

Fields: id, kind (aiProcessing|ocrProcessing|retentionPolicy), policyVersion, granted, decidedAtMs.

### deletionJobs

Path: `users/{ownerId}/deletionJobs/{docId}`

Fields: id, state (requested|running|completed|failed), attemptCount, failureCode?, requestedAtMs, updatedAtMs, completedAtMs or null. Server-only.

## Balance projection

Balances are written inside the ledger commit transaction. They hold `debitMinusCreditMinor`. They can always be recomputed from `ledgerEntries`, and a test proves this (Task 9).
