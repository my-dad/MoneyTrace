# ADR 0002: Integer money and nominal accounts

Status: accepted

## Context

MoneyTrace must preserve exact accounting values across Firestore, Cloud
Functions, clients, exports, and retries. JavaScript `number` values are safe
only within the integer range `-(2^53 - 1)` through `2^53 - 1`. Firestore stores
numeric fields as numbers, while `bigint` is not a portable Firestore wire
representation and would complicate browser and callable boundaries.

The product also needs categories such as food, salary, and fees without
mistaking them for places where money is held.

## Decision

Represent monetary amounts as integer minor units (`amountMinor`) plus an
explicit ISO currency code. Validate every external amount as a safe integer;
do not use floating point arithmetic, implicit rounding, or `bigint` in the
wire model.

Use nominal accounts for income and expense classification. Balance-bearing
accounts represent custody or liabilities; payment instruments reference those
accounts rather than creating another balance.

## Rationale

Safe integers preserve exact values in TypeScript and Firestore without a
custom serialization protocol. The limit is approximately 90 trillion BDT in
minor units, well above the expected product range. Nominal accounts keep
withdrawals, custody transfers, card repayments, and expenses distinct, which
protects the ledger invariants.

## Consequences

- Every amount needs a currency and safe-integer validation.
- Reports and UI formatting convert integer minor units only at presentation
  time.
- Values outside the safe range require a future storage design decision.
- A category cannot be used as a cash or bank balance.
