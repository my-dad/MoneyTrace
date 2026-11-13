# ADR 0004: Use asia-south2 for Firebase resources

Status: superseded by PRD CR-010 (2026-11-13). The Supabase project runs in South Asia (Mumbai); there are no Firebase resources.

Note (2026-11-13): there is no separate staging project any more. The "staging" smoke test below runs on the dev project (`moneytrace-staging`, alias `dev`).

## Context

MoneyTrace is intended for Bangladesh. Firestore's location is permanent, so
the region must be selected before creating a real database. The candidate
India regions were compared for proximity and Firebase support. A network
connect test reaches the nearest Google edge, not the eventual Firestore or
Functions execution region, so it is not sufficient evidence by itself.

## Decision

Use `asia-south2` (Delhi) for Firestore, Cloud Storage, and Cloud Functions.
Keep the local emulator project as `demo-moneytrace`; do not create dev or prod
databases until the staging smoke test passes.

## Rationale

Delhi is geographically closer to Bangladesh than Mumbai. Keeping the primary
Firebase resources together avoids unnecessary cross-region latency and cost.
Firebase's mapping information lists `asia-east2` as the nearest Functions
region for both India Firestore regions, but `asia-south2` is a supported
second-generation Functions region and does not require Functions to be
co-located with the database. The staging deployment and trigger test are the
decisive operational check.

## Consequences

- A Firestore location mistake cannot be corrected in place.
- The staging smoke test must verify that an `onDocumentWritten` trigger and a
  scheduled function deploy and execute in `asia-south2`.
- If that test fails, stop before creating dev or prod and evaluate
  `asia-east2` for Functions while retaining the selected database only if the
  resulting design is acceptable.
- The measured trigger delay and deployment result must be added here after the
  staging test; no latency number is claimed yet.
