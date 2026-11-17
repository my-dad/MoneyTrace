# Logging: complete the in-app logs (design)

Status: draft for Mabrur's approval, 2026-11-17.

## Intent

Mabrur wants a complete logging system, so a failure can be found and explained
afterwards. A typical case: a friend says "it said failed", and Mabrur matches it to the
log line in the Supabase dashboard. Today only rejections and some pipeline failures are
logged. Successful requests, jobs, unexpected errors in `/api` and anything in the
browser are invisible.

## Goals

- Every `/api` request writes exactly one summary line: command or job, outcome, wire
  error code, duration and a request ID.
- The request ID goes back to the browser in a response header and in error bodies, and
  the web app shows it in error messages ("Ref: abc123") so a user can quote it.
- Scheduled jobs log when they start and finish, how many items they processed, and
  any failure.
- Errors that currently escape unlogged get logged: a job that throws, a failed caller
  verification (Supabase Auth down) and anything else that ends in `internal`.
- The web app reports its own crashes and failed `/api` calls to `/api`. They are logged
  there and stored nowhere.

## Non-goals and anti-goals

- **No storage on Supabase for logging** (Mabrur, 2026-11-17): no log table, no Storage
  bucket. Logs exist only as Edge Function output in the Supabase dashboard, kept for
  that plan's built-in window.
- No outside logging service, no alerts and no dashboards. That would be option 2 and
  would need CR-011.
- **Anti-goal:** a log line that holds SMS text, amounts, names, emails, tokens or IP
  addresses. The `JsonLogger` allowlist stays the only way out, and new fields are
  added to it on purpose, each with a test.
- **Anti-goal:** logging that can fail or slow a request. `JsonLogger` already never
  throws, and that stays true.

## Constraints

- Stays inside the existing `Logger` port and `JsonLogger` adapter. No new dependency
  and no change to the stack.
- PRD §10/§12: structured logs only, correlated request IDs, no sensitive raw logs.
- The 30-day operational log retention in the architecture spec isn't met on the free
  plan. Record that gap in the progress note. It's accepted by choosing option 1.

## Approaches considered

1. **Complete the built-in logs (chosen by Mabrur).** Free, no new technology, nothing
   stored by us. Short retention and no alerts.
2. Outside logging service (Better Stack, Axiom, Grafana Cloud). Retention, search
   and alerts, but it needs a change request and a privacy review.
3. Log table in Supabase Postgres. Ruled out: Mabrur doesn't want logging data stored
   on Supabase.

## Design

- **Request ID:** `/api` creates one ID per request and passes it into `runCommand`
  as the existing `correlationId`, so the rejection and failure lines already in place
  share it. It goes back as an `x-request-id` header and an `error.ref` field.
  CORS exposes the header.
- **Access line:** `api.request` at info level (warn for `internal`) with
  `correlationId`, `kind` (command/job), `name`, `status` (ok or wire code), `durationMs`
  and `ownerId` when signed in. `kind` and `name` are new allowlisted token fields.
- **Jobs:** `job.started`, `job.finished` (with `count`) and `job.failed` (with
  `errorName`). The handler catches the throw, logs it and returns `internal`.
- **Verification failure:** if `verifyCaller` throws or Auth returns a non-401 error,
  log `auth.verifyFailed` with `errorName`/`status`. This is my call.
- **Browser reports (my call):** a new command, `reportClientIssue`, runs through the
  normal call gate and rate limit. Its schema allows only an issue kind from a fixed
  list (`renderCrash`, `apiFailed`, `unhandledRejection`), an optional `ref` (request
  ID), the page route as a token, and the app build ID. It logs `client.issue` and
  stores nothing. The web app sends it from a top-level error boundary, from
  `unhandledrejection` and from the API client on 5xx or network failure. It sends at
  most a few per page load and never error messages or stack traces, because those can
  hold user data. Signed-out pages don't report.
- **Tests:** a unit test for each new log line and each allowlist addition, a test that
  forbidden fields (message text, email) are dropped, and an `/api` test that the
  header and `error.ref` match the logged ID.

## Left to the builder

The exact event names, where the timing wrapper sits, and how the web app shows "Ref:"
in each existing error message.
