# ADR 0005: DeepSeek provider

Status: Accepted, 2026-11-07

## Decision

`DeepSeekProvider` calls `POST /chat/completions` with model `deepseek-flash` and JSON mode, using
`fetch` directly with no SDK.

## Facts, from DeepSeek's API docs on 2026-11-07

- JSON mode guarantees valid JSON only. The content can be empty with `finish_reason: stop`, and
  truncated with `finish_reason: length`. So output is schema-validated, and anything else is
  `unusable`.
- No idempotency key is documented, so `retrySafety` is `none`. An unknown outcome waits for the
  user, and each retry may cost a second charge.
- Documented errors are 400, 401, 402, 422, 429, 500 and 503. The docs do not say which were
  unprocessed. We treat 400, 401, 402, 422 and 429 as refused, because each describes a rejected
  request, and everything else as unknown.

## Prices are not recorded here

The pages available did not show prices, so none are hard-coded. `pricing` is optional config. Until
it is set from verified figures, `actualMicroUsd` is omitted and quota stays charged at
`DEFAULT_AI_ESTIMATE_MICRO_USD`, a conservative reservation of USD 0.005 per call. That is a budget
guard, not a measurement, so real spending must be checked in DeepSeek's dashboard.

## Data

Text is masked by `AIGateway` before it reaches the provider. Under PRD CR-002, no real financial
data goes to the real API until the 0B gate passes. DeepSeek's data-processing terms still need
review (PRD section 10).

## Phase 1 verification status

No live API check was run: no `DEEPSEEK_API_KEY` was supplied. The emulator
suite uses the fake provider, and no real financial text was sent to DeepSeek.
Before 0B, verify current pricing, retention/data-processing terms, and the
configured model name against DeepSeek's current documentation.
