# CR-006: accounts start blank at ৳0

Accepted by Mabrur on 2026-11-12 (PRD CR-006, `b008d91`).

## Done (`feat(web): accounts start blank at zero`)

- `/accounts/new` is a new `AddAccountScreen`: name and type only, "Every account starts at ৳0." The old `AccountsScreen` (digits, bank picker, payment details, opening balance) and its tests are removed.
- Setup has 4 steps: welcome, currency and reports, accounts (name and type), reminders. Finish saves the settings only.
- Copy on Home, Accounts, Reports, Settings and Privacy no longer mentions opening balances or account digits.
- The backend is unchanged: `createPaymentInstrument` and `recordOpeningBalance` still exist, and nothing in the UI calls them.
- Checks: `pnpm verify` 100 files / 1,424 tests; `pnpm test:e2e:fixture` 6 passed; `pnpm test:e2e` 2 passed.

## Consequences Mabrur accepted (in the PRD record)

- Every pasted bank SMS asks "Which account?". Nothing remembers the answer per bank; that would be a new feature.
- Balances count only from setup, so a bank account can show below ৳0 until income is recorded.

## Open

- The demo data still has card digits in account names ("City Bank Amex ••7702") and debit-card payment details ("Debit card ••4821"). It needs the CR-006 treatment.
- Opening-balance correction (CR-003 callables I2) is no longer needed: nobody enters an opening balance.
