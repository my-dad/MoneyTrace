# MoneyTrace glossary

## Account

A ledger account that holds a balance in a currency, such as a bank account,
cash, family-held cash, or credit-card liability.

## Nominal account

An accounting category used to classify income or expense. It is not a
balance-bearing payment instrument and does not represent cash custody.

## PaymentInstrument

A card or other instrument used to initiate a payment. A debit card points to
its bank account; it does not have an independent balance.

## SourceEvent

The immutable evidence item that starts processing, such as bank SMS text,
chat text, or a receipt upload. It records provenance and processing state;
it is not itself a ledger posting.

## Transaction

The user-visible accounting event created after validation. A transaction owns
one or more immutable ledger entries and may be corrected only by an atomic
reversal-and-replacement operation.

## Candidate

A parser- or AI-proposed interpretation of a SourceEvent. A candidate is not
accounting truth until deterministic checks and, where required, the user
confirm it.

## System wallet

The non-editable `Cash · place not set` cash account. It receives withdrawals
until the user explains where the physical cash went.

## Unexplained cash

Money currently held in the system wallet. It remains part of total cash but is
not treated as spending and appears as a focused Home question.

## LedgerEntry

An immutable debit or credit line belonging to a transaction. A posted
transaction is balanced when its entries sum to zero in the same currency.

## Claim

A short-lived ownership record for processing one source event at one pipeline
stage. It prevents concurrent workers from acting on the same work.

## Lease

The time-bounded validity of a claim. An expired lease can be recovered by a
later worker according to the claim protocol.

## ProviderCall

The durable record of one call to an AI or OCR provider, including its provider,
stage, outcome, retry safety, and metering information. It is the audit and
retry boundary for external work.

## Retry safety

The adapter's declaration of whether an unknown provider outcome can be retried
without risking a duplicate side effect. The default is `none`; an unknown
outcome for such a provider waits for explicit user approval.

## Cutover marker

A stored opening-balance boundary for an account. New postings and historical
imports must be after the marker so the opening balance is not counted twice.

## Custody

Who physically holds cash. Moving money between a bank and cash, or allocating
cash to a family member, changes custody and is not automatically an expense.

## Pending

Money can be pending in two different senses:

- **Accounting pending:** an authorization or other provisional financial state
  that must not be counted as a final posting.
- **Workflow pending:** evidence or processing that needs review or another
  pipeline step. It is not a claim that money was spent.
