# SMS fixtures

`corpus.json` holds anonymized bank and mobile-wallet SMS. The wording and layout match real
messages, but every amount, date, account digit, phone number, ID and merchant is made up.

To add a provider: take a real message, replace all those values, add it with its `expected` values,
then add a parser in `packages/domain/src/evidence/parsers/`. Never paste a real message here.

`expected.occurredAtIso` is the instant in UTC; Bangladesh is UTC+6. `null` means the SMS has no date.
